import { Card } from "./types";
import { t, type Lang } from "./i18n";

export interface AIConfig {
  apiKey: string;
  baseUrl?: string;
  model?: string;
}

export interface Insight {
  reflection: string;
  connections: string[];
  thinkingPattern: string;
  suggestions: string[];
}

const CONFIG_KEY = "glean_ai_config";
const DEFAULT_BASE_URL = "https://api.deepseek.com";

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

/* ── Insight cache ─────────────────────────── */

const INSIGHTS_KEY = "glean_insights";

type InsightCache = Record<string, { signature: string; insight: Insight }>;

/** Cheap content+thought hash so the cache invalidates when the card changes. */
function signatureOf(card: Card): string {
  const s = card.content + "|" + (card.thought ?? "");
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return String(h);
}

export async function getCachedInsight(card: Card): Promise<Insight | null> {
  try {
    const result = await chrome.storage.local.get(INSIGHTS_KEY);
    const cache = (result[INSIGHTS_KEY] as InsightCache) ?? {};
    const entry = cache[card.id];
    return entry && entry.signature === signatureOf(card) ? entry.insight : null;
  } catch {
    return null;
  }
}

export async function saveCachedInsight(card: Card, insight: Insight): Promise<void> {
  try {
    const result = await chrome.storage.local.get(INSIGHTS_KEY);
    const cache = (result[INSIGHTS_KEY] as InsightCache) ?? {};
    cache[card.id] = { signature: signatureOf(card), insight };
    await chrome.storage.local.set({ [INSIGHTS_KEY]: cache });
  } catch {
    // Caching is best-effort; ignore storage failures.
  }
}

export async function deleteCachedInsight(cardId: string): Promise<void> {
  try {
    const result = await chrome.storage.local.get(INSIGHTS_KEY);
    const cache = (result[INSIGHTS_KEY] as InsightCache) ?? {};
    if (!(cardId in cache)) return;
    delete cache[cardId];
    await chrome.storage.local.set({ [INSIGHTS_KEY]: cache });
  } catch {
    // Best-effort cleanup.
  }
}

export async function generateInsight(
  config: AIConfig,
  currentCard: Card,
  allCards: Card[],
  lang: Lang = "zh"
): Promise<Insight> {
  const baseUrl = config.baseUrl || DEFAULT_BASE_URL;

  const recentCards = allCards
    .filter((c) => c.id !== currentCard.id)
    .slice(0, 20);

  const formatCard = (c: Card, i: number) => {
    let line = i + 1 + '. "' + c.content + '"';
    if (c.thought) line += "\n   " + t("aiThoughtLabel", lang) + ": " + c.thought;
    if (c.source?.heading) line += "\n   " + t("aiSourceLabel", lang) + ": " + c.source.heading;
    return line;
  };

  const contextBlock =
    recentCards.length > 0
      ? "\n\n" + t("aiContextHeader", lang, { count: recentCards.length }) + "\n"
        + recentCards.map(formatCard).join("\n")
      : "\n\n" + t("aiFirstRecord", lang);

  const systemPrompt =
    t("aiRole", lang) + "\n\n" +
    t("aiOutputLang", lang) + "\n" +
    "{\n" +
    '  "reflection": "' + t("aiReflectionDesc", lang) + '",\n' +
    '  "connections": ["' + t("aiConnectionsDesc", lang) + '"],\n' +
    '  "thinkingPattern": "' + t("aiPatternDesc", lang) + '",\n' +
    '  "suggestions": ["' + t("aiSuggestionsDesc", lang) + '"]\n' +
    "}\n\n" +
    t("aiFirstNote", lang);

  let userPrompt = t("aiCurrentInspiration", lang) + ': "' + currentCard.content + '"';
  if (currentCard.thought) {
    userPrompt += "\n" + t("aiUserThought", lang) + ": " + currentCard.thought;
  }
  if (currentCard.source?.heading) {
    userPrompt += "\n" + t("aiSource", lang) + ": " + currentCard.source.heading;
  }
  userPrompt += contextBlock;

  const isAnthropic = baseUrl.includes("anthropic.com");
  let content: string;

  if (isAnthropic) {
    const response = await fetch(baseUrl + "/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": config.apiKey,
        "anthropic-version": "2023-06-01",
      },
      signal: AbortSignal.timeout(30_000),
      body: JSON.stringify({
        model: config.model ?? "claude-3-5-sonnet-20241022",
        max_tokens: 1000,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error("AI API error: " + response.status + " " + error);
    }

    const data = await response.json();
    content = data.content?.[0]?.text;
    if (!content) {
      throw new Error("Empty AI response");
    }
  } else {
    const response = await fetch(baseUrl + "/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + config.apiKey,
      },
      signal: AbortSignal.timeout(30_000),
      body: JSON.stringify({
        model: config.model ?? "deepseek-chat",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.7,
        max_tokens: 1000,
        response_format: { type: "json_object" },
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error("AI API error: " + response.status + " " + error);
    }

    const data = await response.json();
    content = data.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error("Empty AI response");
    }
  }

  try {
    return JSON.parse(content) as Insight;
  } catch {
    throw new Error("Invalid AI response format");
  }
}
