import { Card } from "./types";
import { t, type Lang } from "./i18n";
import { setSecret, getSecret, removeSecret } from "./secrets";
import { createWriteQueue } from "./write-queue";

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

/** Controls exactly how much of the local library is sent with one question. */
export type AskScope = "card" | "related" | "library";

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

// ── Write queue for ask-history (prevents read-modify-write races) ──
const askHistoryQueue = createWriteQueue();

/** @internal Exported for testing only. */
export async function fetchWithRetry(
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

/** @internal Exported for testing only. */
export async function formatAIError(response: Response): Promise<string> {
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

/**
 * Build an OpenAI-compatible API path under `baseUrl`.
 * Most providers expose `/v1/...` directly under the base URL, but some
 * (e.g. Zhipu at `…/api/paas/v4`) already bake the version segment into the
 * base URL. If `baseUrl` already contains a `/vN` version segment, append
 * only the trailing path; otherwise prepend `/v1`.
 *
 * Examples:
 *   apiPath("https://api.deepseek.com", "chat/completions")  → ".../v1/chat/completions"
 *   apiPath("https://open.bigmodel.cn/api/paas/v4", "chat/completions") → ".../v4/chat/completions"
 */
export function apiPath(baseUrl: string, trailing: string): string {
  const trimmed = baseUrl.replace(/\/$/, "");
  return /\/v\d+(?:\/|$)/.test(trimmed)
    ? `${trimmed}/${trailing}`
    : `${trimmed}/v1/${trailing}`;
}

/** Convenience wrapper kept for call sites that only need chat completions. */
function chatCompletionsUrl(baseUrl: string): string {
  return apiPath(baseUrl, "chat/completions");
}

/** @internal Exported for testing only. */
export async function callAI(
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

  const response = await fetchWithRetry(chatCompletionsUrl(baseUrl), {
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

// ── S1: Encrypted AI config with plaintext migration ──────────────

export async function getAIConfig(): Promise<AIConfig | null> {
  // 1. Try encrypted read first
  const encrypted = await getSecret<AIConfig>(CONFIG_KEY);
  if (encrypted) return encrypted;

  // 2. Fallback: check for legacy plaintext data and migrate
  try {
    const result = await chrome.storage.local.get(CONFIG_KEY);
    const plain = result[CONFIG_KEY];
    // A valid plaintext AIConfig must be an object with at least `apiKey`
    if (plain && typeof plain === "object" && typeof (plain as AIConfig).apiKey === "string") {
      const config = plain as AIConfig;
      // Attempt migration: encrypt then delete plaintext
      try {
        await setSecret(CONFIG_KEY, config);
        await chrome.storage.local.remove(CONFIG_KEY);
      } catch {
        // Migration failed — return the plaintext value this time but don't delete it
        // so we can retry on next read. Still better than losing the config.
      }
      return config;
    }
  } catch {
    // Plaintext read failed — nothing to migrate
  }

  return null;
}

export async function saveAIConfig(config: AIConfig): Promise<void> {
  await setSecret(CONFIG_KEY, config);
}

export async function clearAIConfig(): Promise<void> {
  await removeSecret(CONFIG_KEY);
  // Also clear any residual plaintext config left over from a failed
  // encryption migration, otherwise getAIConfig would resurrect it on read.
  try {
    await chrome.storage.local.remove(CONFIG_KEY);
  } catch {
    // Storage already clear / unavailable — nothing to do.
  }
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
  await askHistoryQueue(async () => {
    try {
      const result = await chrome.storage.local.get(ASK_HISTORY_KEY);
      const cache = (result[ASK_HISTORY_KEY] as AskHistoryCache) ?? {};
      cache[cardId] = [...(cache[cardId] ?? []), exchange].slice(-20);
      await chrome.storage.local.set({ [ASK_HISTORY_KEY]: cache });
    } catch (err) {
      // Best-effort caching — don't interrupt the ask flow, but surface the
      // failure so silent data loss is at least observable in the console.
      console.warn("Glean: failed to persist ask exchange", err);
    }
  });
}

export async function deleteAskHistory(cardId: string): Promise<void> {
  await askHistoryQueue(async () => {
    try {
      const result = await chrome.storage.local.get(ASK_HISTORY_KEY);
      const cache = (result[ASK_HISTORY_KEY] as AskHistoryCache) ?? {};
      delete cache[cardId];
      await chrome.storage.local.set({ [ASK_HISTORY_KEY]: cache });
    } catch (err) {
      // Best-effort cleanup — surface failure without throwing.
      console.warn("Glean: failed to delete ask history", err);
    }
  });
}

function formatCardForPrompt(c: Card, i: number): string {
  let line = i + 1 + '. "' + c.content + '"';
  if (c.thought) line += "\n   Thought: " + c.thought;
  if (c.source?.heading) line += "\n   Source: " + c.source.heading;
  return line;
}

function relatedCards(card: Card, allCards: Card[]): Card[] {
  const words = new Set(
    `${card.content} ${card.thought ?? ""}`.toLocaleLowerCase()
      .match(/[\p{L}\p{N}]{3,}/gu) ?? [],
  );
  if (words.size === 0) return [];
  return allCards
    .filter((candidate) => candidate.id !== card.id)
    .map((candidate) => {
      const candidateWords = new Set(
        `${candidate.content} ${candidate.thought ?? ""}`.toLocaleLowerCase()
          .match(/[\p{L}\p{N}]{3,}/gu) ?? [],
      );
      const score = [...words].filter((word) => candidateWords.has(word)).length;
      return { candidate, score };
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || (b.candidate.updatedAt ?? b.candidate.createdAt) - (a.candidate.updatedAt ?? a.candidate.createdAt))
    .slice(0, 8)
    .map(({ candidate }) => candidate);
}

export async function askAboutCard(
  config: AIConfig,
  card: Card,
  allCards: Card[],
  question: string,
  lang: Lang = "zh",
  scope: AskScope = "related",
): Promise<string> {
  const contextCards = scope === "card"
    ? []
    : scope === "related"
      ? relatedCards(card, allCards)
      : allCards.filter((candidate) => candidate.id !== card.id).slice(0, 20);

  const contextBlock =
    contextCards.length > 0
      ? "\n\n" + t("aiAskContextHeader", lang, { count: contextCards.length }) + "\n"
        + contextCards.map(formatCardForPrompt).join("\n")
      : "\n\n" + (scope === "card" ? t("aiAskCardOnly", lang) : t("aiAskFirstRecord", lang));

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

/**
 * Coerce a value into string[]. Wraps a bare string into [string],
 * filters out non-string elements, returns null if nothing usable.
 */
/** @internal Exported for testing only. */
export function coerceStringArray(value: unknown): string[] | null {
  if (Array.isArray(value)) {
    const filtered = value.filter((v): v is string => typeof v === "string");
    return filtered.length > 0 ? filtered : null;
  }
  if (typeof value === "string") {
    return [value];
  }
  return null;
}

/**
 * Runtime-validate and coerce a parsed object into MindsetAnalysis.
 * Throws with an i18n key if the shape is irrecoverable.
 */
export function validateMindsetAnalysis(raw: unknown, lang: Lang): MindsetAnalysis {
  if (!raw || typeof raw !== "object") {
    throw new Error(t("aiInvalidResponse", lang));
  }
  const obj = raw as Record<string, unknown>;

  const themes = coerceStringArray(obj.themes);
  const patterns = coerceStringArray(obj.patterns);
  const connections = coerceStringArray(obj.connections);

  let evolution: string | null = null;
  if (typeof obj.evolution === "string" && obj.evolution.length > 0) {
    evolution = obj.evolution;
  }

  if (!themes || !patterns || !connections || !evolution) {
    throw new Error(t("aiInvalidResponse", lang));
  }

  return { themes, patterns, evolution, connections };
}

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

  const records = [...cards]
    .sort((a, b) => (b.updatedAt ?? b.createdAt) - (a.updatedAt ?? a.createdAt))
    .slice(0, 50)
    .map(formatCardForPrompt)
    .join("\n\n");

  const userPrompt =
    t("aiMindsetRecordsHeader", lang, { count: Math.min(cards.length, 50) }) + "\n\n" +
    records;

  const content = await callAI(config, systemPrompt, userPrompt, true);

  // Parse JSON with existing fallback extraction logic, then validate
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    // Fallback: try to extract JSON from a markdown code block or surrounding text
    // (some models, especially Anthropic, may wrap JSON in ```json ... ```)
    const jsonMatch = content.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
    if (jsonMatch) {
      try {
        parsed = JSON.parse(jsonMatch[1]);
      } catch {
        // fall through
      }
    }
    if (parsed === undefined) {
      // Last resort: find the first { ... } block
      const braceMatch = content.match(/\{[\s\S]*\}/);
      if (braceMatch) {
        try {
          parsed = JSON.parse(braceMatch[0]);
        } catch {
          throw new Error(t("aiInvalidResponse", lang));
        }
      } else {
        throw new Error(t("aiInvalidResponse", lang));
      }
    }
  }

  return validateMindsetAnalysis(parsed, lang);
}
