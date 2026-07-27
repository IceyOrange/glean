import { Card } from "@/lib/types";
import { SyncAdapter, SyncResult, PullResult, NotionConfig } from "./types";

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
  created_time?: string;
  last_edited_time?: string;
  properties: Record<
    string,
    {
      type?: string;
      title?: Array<{ plain_text: string }>;
      rich_text?: Array<{ plain_text: string }>;
      date?: { start: string | null };
      url?: string | null;
    }
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

interface NotionBlockChildrenResponse {
  results: Array<{ type: string } & Record<string, unknown>>;
  next_cursor: string | null;
  has_more: boolean;
}

const DB_NAME = "Glean";
const PROP_NAME = "Name";
const PROP_GLEAN_ID = "Glean ID";
const PROP_CONTENT = "Content";
const PROP_THOUGHT = "Thought";
const PROP_SOURCE = "Source";
const PROP_CREATED = "Created";
const NOTION_RICH_TEXT_LIMIT = 2000;

/** Split text into Notion's maximum 2,000-character rich-text fragments. */
function notionRichText(content: string) {
  const fragments = content.match(new RegExp(`[\\s\\S]{1,${NOTION_RICH_TEXT_LIMIT}}`, "g")) ?? [];
  return fragments.map((fragment) => ({ text: { content: fragment } }));
}

/**
 * Sync-state key: remembers which pages existed in Notion at the last
 * successful pull, so pages archived on the Notion side can be detected
 * (the database query API never returns archived pages).
 */
const SYNC_STATE_KEY = "glean_notion_sync_state";

interface NotionSyncState {
  databaseId: string;
  /** Glean-id-equivalent of every page seen at the last pull. */
  ids: string[];
}

async function loadSyncState(): Promise<NotionSyncState | null> {
  try {
    const result = await chrome.storage.local.get(SYNC_STATE_KEY);
    const state = result[SYNC_STATE_KEY] as NotionSyncState | undefined;
    return state && Array.isArray(state.ids) ? state : null;
  } catch {
    return null;
  }
}

async function saveSyncState(state: NotionSyncState): Promise<void> {
  try {
    await chrome.storage.local.set({ [SYNC_STATE_KEY]: state });
  } catch {
    // Storage unavailable — deletion detection simply stays off.
  }
}

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

/** Ensure the database has all properties Glean needs. Creates any that are missing.
 *  Returns the name of the database's title property (it can be renamed in Notion). */
async function ensureDatabaseProperties(token: string, databaseId: string): Promise<string> {
  const db = await notionFetch<NotionDatabaseSchema>(token, `/databases/${databaseId}`);
  const existing = new Set(Object.keys(db.properties));

  const titleProp =
    Object.entries(db.properties).find(([, def]) => def.type === "title")?.[0] ??
    PROP_NAME;

  const missing = Object.entries(REQUIRED_PROPERTIES).filter(
    ([name]) => !existing.has(name)
  );

  if (missing.length === 0) return titleProp;

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

  return titleProp;
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

const BODY_TEXT_CAP = 5000;

/**
 * Read the plain text of a page's body blocks. Notion users often paste the
 * quote into the page body instead of any property — without this, such
 * records pull down without their quote (or not at all).
 */
async function fetchPageBodyText(token: string, pageId: string): Promise<string> {
  try {
    const parts: string[] = [];
    let total = 0;
    let cursor: string | null = null;

    do {
      const data: NotionBlockChildrenResponse = await notionFetch(token,
        `/blocks/${pageId}/children?page_size=100${cursor ? `&start_cursor=${cursor}` : ""}`
      );
      for (const block of data.results) {
        const payload = block[block.type] as
          | { rich_text?: Array<{ plain_text: string }> }
          | undefined;
        const text = payload?.rich_text?.map((rt) => rt.plain_text).join("") ?? "";
        if (text) {
          parts.push(text);
          total += text.length;
        }
        if (total >= BODY_TEXT_CAP) break;
      }
      if (total >= BODY_TEXT_CAP) break;
      cursor = data.has_more ? data.next_cursor : null;
    } while (cursor);

    return parts.join("\n").slice(0, BODY_TEXT_CAP);
  } catch {
    // Body unreadable (permissions, etc.) — fall back to property-only pull.
    return "";
  }
}

function extractGleanId(page: NotionPage): string | null {
  const prop = page.properties[PROP_GLEAN_ID];
  if (prop?.type === "rich_text" && prop.rich_text?.length) {
    return prop.rich_text[0].plain_text;
  }
  return null;
}

/**
 * Stable card id for pages created on the Notion side (which have no
 * "Glean ID" property). Derived from the immutable Notion page id, so the
 * same page always maps to the same card.
 */
function derivedGleanId(pageId: string): string {
  return `notion_${pageId}`;
}

/** The card id a Notion page corresponds to, whether Glean-created or not. */
function pageGleanId(page: NotionPage): string {
  return extractGleanId(page) ?? derivedGleanId(page.id);
}

function richTextOf(
  prop: { type?: string; rich_text?: Array<{ plain_text: string }> } | undefined
): string {
  if (prop?.type !== "rich_text" || !prop.rich_text) return "";
  return prop.rich_text.map((rt) => rt.plain_text).join("");
}

function titleOf(page: NotionPage): string {
  // The title property can be renamed in Notion ("Title", "标题", …) — find
  // it by type instead of assuming it is called "Name".
  for (const prop of Object.values(page.properties)) {
    if (prop?.type === "title" && prop.title) {
      return prop.title.map((t) => t.plain_text).join("");
    }
  }
  return "";
}

/** Convert a Notion page back into a Card. */
function pageToCard(page: NotionPage, bodyText = ""): Card | null {
  const id = pageGleanId(page);

  const name = titleOf(page);
  const contentPropText = richTextOf(page.properties[PROP_CONTENT]);
  // Precedence: the Content property (what Glean itself writes) → the page
  // body (where Notion users naturally paste quotes) → the page title.
  const content = contentPropText || bodyText || name;
  const contentFromName = !contentPropText && !bodyText && !!name;
  const contentFromBody = !contentPropText && !!bodyText;

  const thoughtText = richTextOf(page.properties[PROP_THOUGHT]);
  const thought = thoughtText || undefined;

  const sourceProp = page.properties[PROP_SOURCE];
  const sourceUrl = sourceProp?.type === "url" ? sourceProp.url ?? "" : "";

  const createdProp = page.properties[PROP_CREATED];
  let createdAt = Date.now();
  if (createdProp?.type === "date" && createdProp.date?.start) {
    // Notion stores dates as YYYY-MM-DD; convert to midnight timestamp.
    createdAt = new Date(createdProp.date.start).getTime();
  }

  if (!content) return null;

  let siteName: string | undefined;
  let sourceTitle = "";
  if (contentFromName) {
    // The title itself became the content — nothing left for the source.
  } else if (contentFromBody) {
    // Title reads as the article/source name when the body holds the quote.
    sourceTitle = name;
  } else {
    // Recover the site name from titles Glean wrote ("<site> — <quote start>").
    const sep = name.indexOf(" — ");
    if (sep > 0) siteName = name.slice(0, sep);
    sourceTitle = siteName ?? "";
  }

  const card: Card = {
    id,
    content,
    thought,
    source: { url: sourceUrl, title: sourceTitle, siteName },
    createdAt,
  };

  // Notion's edit timestamp drives last-write-wins conflict resolution, so
  // edits made on the Notion side can actually flow back down.
  if (page.last_edited_time) {
    const edited = Date.parse(page.last_edited_time);
    if (!Number.isNaN(edited)) card.updatedAt = edited;
  }

  return card;
}

function buildPageProperties(card: Card, includeName: boolean, titleProp: string = PROP_NAME) {
  const properties: Record<string, object> = {
    [PROP_CONTENT]: {
      rich_text: notionRichText(card.content),
    },
    [PROP_THOUGHT]: {
      rich_text: card.thought
        ? notionRichText(card.thought)
        : [],
    },
    [PROP_SOURCE]: {
      url: card.source.url || null,
    },
    [PROP_CREATED]: {
      date: { start: formatDate(card.createdAt) },
    },
    [PROP_GLEAN_ID]: {
      rich_text: notionRichText(card.id),
    },
  };

  if (includeName) {
    const site =
      card.source.siteName || card.source.heading || card.source.title;
    const title = site ? `${site} — ${card.content.slice(0, 60)}` : card.content.slice(0, 80);
    properties[titleProp] = {
      title: [{ text: { content: title } }],
    };
  }

  return properties;
}

/**
 * Whether an existing Notion page differs from the card and needs a PATCH.
 * The page title is deliberately excluded — updates never rewrite it, so a
 * rename made in Notion is left alone.
 */
function pageNeedsUpdate(page: NotionPage, card: Card): boolean {
  // A page missing its "Glean ID" must be backfilled even if content matches.
  if (!extractGleanId(page)) return true;

  if (richTextOf(page.properties[PROP_CONTENT]) !== card.content) return true;
  if (richTextOf(page.properties[PROP_THOUGHT]) !== (card.thought ?? "")) return true;

  const sourceProp = page.properties[PROP_SOURCE];
  const pageUrl = sourceProp?.type === "url" ? sourceProp.url ?? "" : "";
  if (pageUrl !== (card.source.url || "")) return true;

  const createdProp = page.properties[PROP_CREATED];
  const pageDate =
    createdProp?.type === "date" ? createdProp.date?.start ?? "" : "";
  if (pageDate !== formatDate(card.createdAt)) return true;

  return false;
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

    let titleProp = PROP_NAME;
    await ensureDatabaseProperties(config.token, database.id).then(
      (tp) => (titleProp = tp)
    );

    const pages = await queryAllPages(config.token, database.id);
    // Multiple pages can share one Glean ID (matching bugs in pre-fix
    // versions, overlapping manual+alarm syncs, or Notion-side row
    // duplication, which copies property values). Duplicates break every
    // downstream invariant: updates land on whichever copy the map happens
    // to keep, so editing a card makes its *other* copy look like a newly
    // created row. Keep the earliest-created page (the original) and
    // archive the rest — sharing a Glean ID means unambiguously the same
    // card, and archiving is a soft delete the user can undo in Notion.
    const createdTs = (page: NotionPage): number => {
      const t = Date.parse(page.created_time ?? "");
      return Number.isNaN(t) ? Number.POSITIVE_INFINITY : t;
    };
    const pagesByGleanId = new Map<string, NotionPage>();
    const duplicatePages: NotionPage[] = [];
    for (const page of pages) {
      const key = pageGleanId(page);
      const existing = pagesByGleanId.get(key);
      if (!existing) {
        pagesByGleanId.set(key, page);
      } else if (createdTs(page) < createdTs(existing)) {
        duplicatePages.push(existing);
        pagesByGleanId.set(key, page);
      } else {
        duplicatePages.push(page);
      }
    }

    // Upsert pages with bounded concurrency (Notion limit ≈ 3 req/s).
    // Single-item failures are collected but don't abort the batch.
    const errors: string[] = [];
    const CONCURRENCY = 3;

    // Archive the duplicates before upserting, so every later lookup hits
    // the single canonical page.
    let dedupedCount = 0;
    for (let i = 0; i < duplicatePages.length; i += CONCURRENCY) {
      const batch = duplicatePages.slice(i, i + CONCURRENCY);
      await Promise.all(
        batch.map(async (page) => {
          try {
            await notionFetch(config.token, `/pages/${page.id}`, {
              method: "PATCH",
              body: JSON.stringify({ archived: true }),
            });
            dedupedCount++;
          } catch (err) {
            errors.push(
              `Dedupe ${page.id}: ${err instanceof Error ? err.message : String(err)}`
            );
          }
        })
      );
    }

    const upsertCard = async (card: Card): Promise<void> => {
      // Skip tombstones — they are handled separately below.
      if (card.deletedAt) return;

      const existingPage = pagesByGleanId.get(card.id);

      try {
        if (existingPage) {
          // Converged pages are left untouched — this avoids needless writes
          // (which would bump last_edited_time and echo back as fake updates).
          if (!pageNeedsUpdate(existingPage, card)) return;
          await notionFetch(config.token, `/pages/${existingPage.id}`, {
            method: "PATCH",
            // No title on updates: a rename made in Notion is preserved.
            body: JSON.stringify({ properties: buildPageProperties(card, false) }),
          });
        } else {
          await notionFetch(config.token, "/pages", {
            method: "POST",
            body: JSON.stringify({
              parent: { database_id: database.id },
              properties: buildPageProperties(card, true, titleProp),
            }),
          });
        }
      } catch (err) {
        errors.push(
          `Card ${card.id}: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    };

    // Archive (soft-delete in Notion) pages for tombstoned cards.
    const archiveDeleted = async (card: Card): Promise<void> => {
      const existingPage = pagesByGleanId.get(card.id);
      if (!existingPage) return;
      try {
        await notionFetch(config.token, `/pages/${existingPage.id}`, {
          method: "PATCH",
          body: JSON.stringify({ archived: true }),
        });
      } catch (err) {
        errors.push(
          `Archive ${card.id}: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    };

    // Bounded concurrency pool: process cards in chunks of CONCURRENCY.
    const activeCards = cards.filter((c) => !c.deletedAt);
    const tombstonedCards = cards.filter((c) => c.deletedAt);

    for (let i = 0; i < activeCards.length; i += CONCURRENCY) {
      const batch = activeCards.slice(i, i + CONCURRENCY);
      await Promise.all(batch.map(upsertCard));
    }

    for (let i = 0; i < tombstonedCards.length; i += CONCURRENCY) {
      const batch = tombstonedCards.slice(i, i + CONCURRENCY);
      await Promise.all(batch.map(archiveDeleted));
    }

    if (errors.length > 0) {
      return {
        ok: true,
        syncedAt: Date.now(),
        databaseId: database.id,
        dedupedCount: dedupedCount || undefined,
        error: `${errors.length} item(s) failed: ${errors.join("; ")}`,
      };
    }

    return {
      ok: true,
      syncedAt: Date.now(),
      databaseId: database.id,
      dedupedCount: dedupedCount || undefined,
    };
  },

  async pull(config) {
    try {
      // Without a configured database id, discover the "Glean" database the
      // same way sync() does — otherwise the first sync would be push-only.
      let databaseId = config.databaseId;
      if (!databaseId) {
        const database = await findGleanDatabase(config.token);
        if (!database) return { ok: true, cards: [] };
        databaseId = database.id;
      }

      const pages = await queryAllPages(config.token, databaseId);
      // Pages with an empty Content property need their body fetched (the
      // quote may live there). Glean-created pages always have Content set,
      // so they never trigger the extra request. Bounded concurrency.
      const cards: Card[] = [];
      const BODY_CONCURRENCY = 3;
      for (let i = 0; i < pages.length; i += BODY_CONCURRENCY) {
        const batch = pages.slice(i, i + BODY_CONCURRENCY);
        const resolved = await Promise.all(
          batch.map(async (page) => {
            const body = richTextOf(page.properties[PROP_CONTENT])
              ? ""
              : await fetchPageBodyText(config.token, page.id);
            return pageToCard(page, body);
          })
        );
        for (const card of resolved) if (card) cards.push(card);
      }

      // ── Detect pages archived on the Notion side ──
      // The query API never returns archived pages, so diff against the set
      // of page ids seen at the last successful pull. Each disappearance is
      // surfaced exactly once (the new state replaces the old).
      const currentIds = pages.map(pageGleanId);
      const previous = await loadSyncState();
      if (previous && previous.databaseId === databaseId) {
        const currentSet = new Set(currentIds);
        const now = Date.now();
        for (const missingId of previous.ids) {
          if (currentSet.has(missingId)) continue;
          cards.push({
            id: missingId,
            content: "",
            source: { url: "", title: "" },
            createdAt: 0,
            updatedAt: now,
            deletedAt: now,
          });
        }
      }
      await saveSyncState({ databaseId, ids: currentIds });

      return { ok: true, cards, databaseId };
    } catch (err) {
      return {
        ok: false,
        error: `Failed to pull from Notion: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
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
