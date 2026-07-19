import { Card } from "./types";
import { t, type Lang } from "./i18n";

export interface AIConfig {
  apiKey: string;
  baseUrl?: string;
  model?: string;
}

export interface AskExchange {
  question: string;
  answer: string;
  createdAt: number;
}

export interface MindsetAnalysis {
  themes: string[];
  patterns: string[];
  evolution: string;
  connections: string[];
}

const CONFIG_KEY = "glean_ai_config";
const DEFAULT_BASE_URL = "https://api.deepseek.com";
const ASK_HISTORY_KEY = "glean_ask_history";

type AskHistoryCache = Record<string, AskExchange[]>;

async function fetchWithRetry(
  url: string,
  options: RequestInit,
  retries = 1,
  delayMs = 2000
): Promise<Response> {
  let attempt = 0;
  while (true) {
    const res = await fetch(url, options);
    if (res.status === 429 && attempt < retries) {
      attempt++;
      await new Promise((r) => setTimeout(r, delayMs));
      continue;
    }
    return res;
  }
}

async function formatAIError(response: Response): Promise<string> {
  const text = await response.text();
  try {
    const data = JSON.parse(text);
    if (data.message) return `AI API error: ${response.status} ${data.message}`;
    if (data.error?.message) return `AI API error: ${response.status} ${data.error.message}`;
  } catch {
    // fall through
  }
  return `AI API error: ${response.status} ${text}`;
}

async function callAI(
  config: AIConfig,
  systemPrompt: string,
  userPrompt: string,
  jsonMode: boolean
): Promise<string> {
  const baseUrl = config.baseUrl || DEFAULT_BASE_URL;
  const isAnthropic = baseUrl.includes("anthropic.com");

  if (isAnthropic) {
    const response = await fetchWithRetry(baseUrl + "/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": config.apiKey,
        "anthropic-version": "2023-06-01",
      },
      signal: AbortSignal.timeout(60_000),
      body: JSON.stringify({
        model: config.model ?? "claude-3-5-sonnet-20241022",
        max_tokens: jsonMode ? 2048 : 1600,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
      }),
    });

    if (!response.ok) {
      throw new Error(await formatAIError(response));
    }

    const data = await response.json();
    const content = data.content?.[0]?.text;
    if (!content) {
      throw new Error("Empty AI response");
    }
    return content;
  }

  const body: Record<string, unknown> = {
    model: config.model ?? "deepseek-chat",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    temperature: 0.7,
    max_tokens: jsonMode ? 2048 : 1600,
  };
  if (jsonMode) {
    body.response_format = { type: "json_object" };
  }

  const response = await fetchWithRetry(baseUrl + "/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + config.apiKey,
    },
    signal: AbortSignal.timeout(60_000),
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(await formatAIError(response));
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("Empty AI response");
  }
  return content;
}

export async function getAIConfig(): Promise<AIConfig | null> {
  try {
    const result = await chrome.storage.local.get(CONFIG_KEY);
    return (result[CONFIG_KEY] as AIConfig) ?? null;
  } catch {
    return null;
  }
}

export async function saveAIConfig(config: AIConfig): Promise<void> {
  await chrome.storage.local.set({ [CONFIG_KEY]: config });
}

export async function clearAIConfig(): Promise<void> {
  await chrome.storage.local.remove(CONFIG_KEY);
}

/* ── Ask about a card ─────────────────────── */

export async function getAskHistory(cardId: string): Promise<AskExchange[]> {
  try {
    const result = await chrome.storage.local.get(ASK_HISTORY_KEY);
    const cache = (result[ASK_HISTORY_KEY] as AskHistoryCache) ?? {};
    return cache[cardId] ?? [];
  } catch {
    return [];
  }
}

export async function saveAskExchange(cardId: string, exchange: AskExchange): Promise<void> {
  try {
    const result = await chrome.storage.local.get(ASK_HISTORY_KEY);
    const cache = (result[ASK_HISTORY_KEY] as AskHistoryCache) ?? {};
    cache[cardId] = [...(cache[cardId] ?? []), exchange].slice(-20);
    await chrome.storage.local.set({ [ASK_HISTORY_KEY]: cache });
  } catch {
    // Best-effort caching.
  }
}

export async function deleteAskHistory(cardId: string): Promise<void> {
  try {
    const result = await chrome.storage.local.get(ASK_HISTORY_KEY);
    const cache = (result[ASK_HISTORY_KEY] as AskHistoryCache) ?? {};
    delete cache[cardId];
    await chrome.storage.local.set({ [ASK_HISTORY_KEY]: cache });
  } catch {
    // Best-effort cleanup.
  }
}

function formatCardForPrompt(c: Card, i: number): string {
  let line = i + 1 + '. "' + c.content + '"';
  if (c.thought) line += "\n   Thought: " + c.thought;
  if (c.source?.heading) line += "\n   Source: " + c.source.heading;
  return line;
}

export async function askAboutCard(
  config: AIConfig,
  card: Card,
  allCards: Card[],
  question: string,
  lang: Lang = "zh"
): Promise<string> {
  const recentCards = allCards
    .filter((c) => c.id !== card.id)
    .slice(0, 20);

  const contextBlock =
    recentCards.length > 0
      ? "\n\n" + t("aiAskContextHeader", lang, { count: recentCards.length }) + "\n"
        + recentCards.map(formatCardForPrompt).join("\n")
      : "\n\n" + t("aiAskFirstRecord", lang);

  const systemPrompt =
    t("aiAskRole", lang) + "\n\n" +
    t("aiAskOutputLang", lang);

  let userPrompt = t("aiAskCurrentInspiration", lang) + ': "' + card.content + '"';
  if (card.thought) {
    userPrompt += "\n" + t("aiAskUserThought", lang) + ": " + card.thought;
  }
  if (card.source?.heading) {
    userPrompt += "\n" + t("aiAskSource", lang) + ": " + card.source.heading;
  }
  userPrompt += contextBlock;
  userPrompt += "\n\n" + t("aiAskQuestionLabel", lang) + ": " + question;

  return await callAI(config, systemPrompt, userPrompt, false);
}

/* ── Analyze mindset across cards ─────────── */

export async function analyzeMindset(
  config: AIConfig,
  cards: Card[],
  lang: Lang = "zh"
): Promise<MindsetAnalysis> {
  if (cards.length === 0) {
    throw new Error(t("mindsetEmpty", lang));
  }

  const systemPrompt =
    t("aiMindsetRole", lang) + "\n\n" +
    t("aiMindsetOutputLang", lang) + "\n" +
    "{\n" +
    '  "themes": ["' + t("aiMindsetThemesDesc", lang) + '"],\n' +
    '  "patterns": ["' + t("aiMindsetPatternsDesc", lang) + '"],\n' +
    '  "evolution": "' + t("aiMindsetEvolutionDesc", lang) + '",\n' +
    '  "connections": ["' + t("aiMindsetConnectionsDesc", lang) + '"]\n' +
    "}\n";

  const records = cards
    .slice(0, 50)
    .map(formatCardForPrompt)
    .join("\n\n");

  const userPrompt =
    t("aiMindsetRecordsHeader", lang, { count: cards.length }) + "\n\n" +
    records;

  const content = await callAI(config, systemPrompt, userPrompt, true);

  try {
    return JSON.parse(content) as MindsetAnalysis;
  } catch {
    // Fallback: try to extract JSON from a markdown code block or surrounding text
    // (some models, especially Anthropic, may wrap JSON in ```json ... ```)
    const jsonMatch = content.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[1]) as MindsetAnalysis;
      } catch {
        // fall through
      }
    }
    // Last resort: find the first { ... } block
    const braceMatch = content.match(/\{[\s\S]*\}/);
    if (braceMatch) {
      try {
        return JSON.parse(braceMatch[0]) as MindsetAnalysis;
      } catch {
        // fall through
      }
    }
    throw new Error("Invalid AI response format");
  }
}
