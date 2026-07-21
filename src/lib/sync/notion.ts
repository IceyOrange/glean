import { Card } from "@/lib/types";
import { SyncAdapter, SyncResult, NotionConfig } from "./types";

const NOTION_API = "https://api.notion.com/v1";
const NOTION_VERSION = "2022-06-28";

function formatDate(isoTimestamp: number): string {
  const d = new Date(isoTimestamp);
  return d.toISOString().slice(0, 10);
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function notionFetch<T>(
  token: string,
  path: string,
  options: RequestInit = {}
): Promise<T> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(`${NOTION_API}${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        "Notion-Version": NOTION_VERSION,
        "Content-Type": "application/json",
        ...options.headers,
      },
    });

    if (res.ok) {
      return (await res.json()) as T;
    }

    const body = await res.text();
    lastError = new Error(`Notion ${res.status}: ${body}`);

    // Rate limited: back off exponentially before retrying.
    if (res.status === 429) {
      await sleep(1000 * 2 ** attempt);
      continue;
    }

    throw lastError;
  }

  throw lastError!;
}

interface NotionDatabase {
  id: string;
  title: Array<{ plain_text: string }>;
}

interface NotionPage {
  id: string;
  properties: Record<
    string,
    { type?: string; rich_text?: Array<{ plain_text: string }> }
  >;
}

interface NotionSearchResponse {
  results: NotionDatabase[];
}

interface NotionQueryResponse {
  results: NotionPage[];
  next_cursor: string | null;
  has_more: boolean;
}

const DB_NAME = "Glean";
const PROP_GLEAN_ID = "Glean ID";
const PROP_CONTENT = "Content";
const PROP_THOUGHT = "Thought";
const PROP_SOURCE = "Source";
const PROP_CREATED = "Created";

/** Properties Glean expects on the target database. */
const REQUIRED_PROPERTIES: Record<string, { type: string }> = {
  [PROP_CONTENT]: { type: "rich_text" },
  [PROP_THOUGHT]: { type: "rich_text" },
  [PROP_SOURCE]: { type: "url" },
  [PROP_CREATED]: { type: "date" },
  [PROP_GLEAN_ID]: { type: "rich_text" },
};

interface NotionDatabaseSchema {
  properties: Record<string, { type: string }>;
}

/** Ensure the database has all properties Glean needs. Creates any that are missing. */
async function ensureDatabaseProperties(token: string, databaseId: string): Promise<void> {
  const db = await notionFetch<NotionDatabaseSchema>(token, `/databases/${databaseId}`);
  const existing = new Set(Object.keys(db.properties));

  const missing = Object.entries(REQUIRED_PROPERTIES).filter(
    ([name]) => !existing.has(name)
  );

  if (missing.length === 0) return;

  const properties: Record<string, object> = {};
  for (const [name, def] of missing) {
    switch (def.type) {
      case "rich_text":
        properties[name] = { rich_text: {} };
        break;
      case "url":
        properties[name] = { url: {} };
        break;
      case "date":
        properties[name] = { date: {} };
        break;
    }
  }

  await notionFetch(token, `/databases/${databaseId}`, {
    method: "PATCH",
    body: JSON.stringify({ properties }),
  });
}

async function findGleanDatabase(token: string): Promise<NotionDatabase | null> {
  const data = await notionFetch<NotionSearchResponse>(token, "/search", {
    method: "POST",
    body: JSON.stringify({
      query: DB_NAME,
      filter: { value: "database", property: "object" },
    }),
  });

  return (
    data.results.find((db) =>
      db.title.some((t) => t.plain_text === DB_NAME)
    ) ?? null
  );
}

async function queryAllPages(token: string, databaseId: string): Promise<NotionPage[]> {
  const pages: NotionPage[] = [];
  let cursor: string | null = null;

  do {
    const data: NotionQueryResponse = await notionFetch(
      token,
      `/databases/${databaseId}/query`,
      {
        method: "POST",
        body: JSON.stringify({
          page_size: 100,
          start_cursor: cursor ?? undefined,
        }),
      }
    );
    pages.push(...data.results);
    cursor = data.next_cursor;
  } while (cursor);

  return pages;
}

function extractGleanId(page: NotionPage): string | null {
  const prop = page.properties[PROP_GLEAN_ID];
  if (prop?.type === "rich_text" && prop.rich_text?.length) {
    return prop.rich_text[0].plain_text;
  }
  return null;
}

function buildPageProperties(card: Card) {
  const site =
    card.source.siteName || card.source.heading || card.source.title;
  const title = site ? `${site} — ${card.content.slice(0, 60)}` : card.content.slice(0, 80);

  return {
    Name: {
      title: [{ text: { content: title } }],
    },
    [PROP_CONTENT]: {
      rich_text: [{ text: { content: card.content } }],
    },
    [PROP_THOUGHT]: {
      rich_text: card.thought
        ? [{ text: { content: card.thought } }]
        : [],
    },
    [PROP_SOURCE]: {
      url: card.source.url || null,
    },
    [PROP_CREATED]: {
      date: { start: formatDate(card.createdAt) },
    },
    [PROP_GLEAN_ID]: {
      rich_text: [{ text: { content: card.id } }],
    },
  };
}

export const notionAdapter: SyncAdapter<NotionConfig> = {
  name: "Notion",

  validate(config) {
    if (!config.token.trim()) return "Integration token is required";
    return null;
  },

  async sync(cards, config) {
    const database = config.databaseId
      ? { id: config.databaseId, title: [{ plain_text: DB_NAME }] }
      : await findGleanDatabase(config.token);

    if (!database) {
      return {
        ok: false,
        error:
          'No Notion database named "Glean" found. Create one and share it with your integration, or enter its Database ID.',
      };
    }

    await ensureDatabaseProperties(config.token, database.id);

    const pages = await queryAllPages(config.token, database.id);
    const existingByGleanId = new Map<string, string>();
    for (const page of pages) {
      const id = extractGleanId(page);
      if (id) existingByGleanId.set(id, page.id);
    }

    for (let i = 0; i < cards.length; i++) {
      const card = cards[i];
      const properties = buildPageProperties(card);
      const existingId = existingByGleanId.get(card.id);

      if (existingId) {
        await notionFetch(config.token, `/pages/${existingId}`, {
          method: "PATCH",
          body: JSON.stringify({ properties }),
        });
      } else {
        await notionFetch(config.token, "/pages", {
          method: "POST",
          body: JSON.stringify({
            parent: { database_id: database.id },
            properties,
          }),
        });
      }

      // Small delay between writes to stay under Notion's rate limits.
      if (i < cards.length - 1) {
        await sleep(200);
      }
    }

    return { ok: true, syncedAt: Date.now(), databaseId: database.id };
  },
};

/** Search all databases accessible to the integration. */
export async function searchDatabases(
  token: string
): Promise<Array<{ id: string; title: string }>> {
  const data = await notionFetch<{
    results: Array<{
      id: string;
      object: string;
      title?: Array<{ plain_text: string }>;
    }>;
  }>(token, "/search", {
    method: "POST",
    body: JSON.stringify({ filter: { property: "object", value: "database" } }),
  });

  return data.results
    .filter((r) => r.object === "database")
    .map((r) => ({
      id: r.id,
      title: r.title?.map((t) => t.plain_text).join("") || "Untitled",
    }));
}
