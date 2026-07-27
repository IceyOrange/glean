import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { notionAdapter } from "./notion";
import { webdavAdapter } from "./webdav";
import { gistAdapter } from "./gist";
import { mergeCards } from "./merge";
import { Card } from "@/lib/types";

// Minimal in-memory chrome.storage.local mock for sync-state persistence.
const chromeStore = new Map<string, unknown>();
(globalThis as Record<string, unknown>).chrome = {
  storage: {
    local: {
      get: async (key: string) => ({ [key]: chromeStore.get(key) }),
      set: async (items: Record<string, unknown>) => {
        for (const [k, v] of Object.entries(items)) chromeStore.set(k, v);
      },
    },
  },
};

const sampleCards: Card[] = [
  {
    id: "card-1",
    content: "The only way to do great work is to love what you do.",
    thought: "Resonates deeply.",
    source: {
      url: "https://example.com/quote",
      title: "Example",
      heading: "On Work",
      siteName: "Example Blog",
    },
    createdAt: 1700000000000,
  },
  {
    id: "card-2",
    content: "Simplicity is the ultimate sophistication.",
    source: {
      url: "https://example.com/simple",
      title: "Simple",
    },
    createdAt: 1700000100000,
  },
];

describe("notionAdapter", () => {
  it("validates missing token", () => {
    expect(notionAdapter.validate({ provider: "notion", token: "" })).toBe("Integration token is required");
    expect(notionAdapter.validate({ provider: "notion", token: "secret_xxx" })).toBeNull();
  });
});

describe("webdavAdapter", () => {
  it("validates required fields", () => {
    expect(webdavAdapter.validate({
      provider: "webdav",
      serverUrl: "",
      username: "user",
      password: "pass",
      remotePath: "/Glean/",
    })).toBe("Server URL is required");

    expect(webdavAdapter.validate({
      provider: "webdav",
      serverUrl: "https://dav.jianguoyun.com/dav/",
      username: "",
      password: "pass",
      remotePath: "/Glean/",
    })).toBe("Username is required");

    expect(webdavAdapter.validate({
      provider: "webdav",
      serverUrl: "https://dav.jianguoyun.com/dav/",
      username: "user",
      password: "",
      remotePath: "/Glean/",
    })).toBe("Password is required");

    expect(webdavAdapter.validate({
      provider: "webdav",
      serverUrl: "https://dav.jianguoyun.com/dav/",
      username: "user",
      password: "pass",
      remotePath: "",
    })).toBe("Remote path is required");

    expect(webdavAdapter.validate({
      provider: "webdav",
      serverUrl: "https://dav.jianguoyun.com/dav/",
      username: "user",
      password: "pass",
      remotePath: "/Glean/",
    })).toBeNull();
  });
});

describe("webdavAdapter.sync", () => {
  beforeEach(() => {
    global.fetch = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("uploads latest and dated backups via WebDAV", async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      status: 207,
      text: async () => "",
    } as Response);

    const result = await webdavAdapter.sync(sampleCards, {
      provider: "webdav",
      serverUrl: "https://dav.jianguoyun.com/dav/",
      username: "tester",
      password: "app-password",
      remotePath: "/Glean/",
    });

    expect(result.ok).toBe(true);
    expect(result.syncedAt).toBeDefined();

    const calls = vi.mocked(global.fetch).mock.calls;
    // First call: PROPFIND to check directory
    expect(calls[0][1]?.method).toBe("PROPFIND");
    // Second call: PUT latest
    expect(calls[1][0]).toMatch(/glean-backup-latest\.json$/);
    expect(calls[1][1]?.method).toBe("PUT");
    // Third call: PUT dated
    expect(calls[2][0]).toMatch(/glean-backup-\d{4}-\d{2}-\d{2}\.json$/);
    expect(calls[2][1]?.method).toBe("PUT");
    // Fourth call: PROPFIND cleanup to enforce retention
    expect(calls[3][1]?.method).toBe("PROPFIND");
    expect(calls[3][1]?.headers).toMatchObject({ Depth: "1" });

    // Verify JSON body contains cards
    const body = calls[1][1]?.body as string;
    expect(JSON.parse(body)).toEqual(sampleCards);
  });

  it("creates directory if it does not exist", async () => {
    vi.mocked(global.fetch)
      .mockResolvedValueOnce({ ok: false, status: 404, text: async () => "Not found" } as Response)
      .mockResolvedValueOnce({ ok: true, status: 201, text: async () => "" } as Response)
      .mockResolvedValue({ ok: true, status: 200, text: async () => "" } as Response);

    const result = await webdavAdapter.sync(sampleCards, {
      provider: "webdav",
      serverUrl: "https://dav.jianguoyun.com/dav/",
      username: "tester",
      password: "app-password",
      remotePath: "/Glean/",
    });

    expect(result.ok).toBe(true);
    expect(vi.mocked(global.fetch).mock.calls[1][1]?.method).toBe("MKCOL");
  });
});

describe("notionAdapter.sync", () => {
  beforeEach(() => {
    global.fetch = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns error when no database is found", async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ results: [] }),
    } as Response);

    const result = await notionAdapter.sync(sampleCards, { provider: "notion", token: "secret_xxx" });

    expect(result.ok).toBe(false);
    expect(result.error).toContain('No Notion database named "Glean"');
  });

  it("upserts pages by Glean ID", async () => {
    const existingPageId = "page-existing";
    vi.mocked(global.fetch)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          results: [{ id: "db-1", title: [{ plain_text: "Glean" }] }],
        }),
      } as Response)
      .mockResolvedValueOnce({
        // ensureDatabaseProperties: GET /databases/db-1 — all required
        // properties already present, so no PATCH is issued.
        ok: true,
        json: async () => ({
          properties: {
            "Glean ID": { type: "rich_text" },
            Content: { type: "rich_text" },
            Thought: { type: "rich_text" },
            Source: { type: "url" },
            Created: { type: "date" },
          },
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          results: [
            {
              id: existingPageId,
              properties: {
                "Glean ID": { type: "rich_text", rich_text: [{ plain_text: "card-1" }] },
              },
            },
          ],
          next_cursor: null,
          has_more: false,
        }),
      } as Response)
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) } as Response) // update card-1
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) } as Response); // create card-2

    const result = await notionAdapter.sync(sampleCards, { provider: "notion", token: "secret_xxx" });

    expect(result.ok).toBe(true);
    const calls = vi.mocked(global.fetch).mock.calls;

    // Update existing page
    const updateCall = calls.find((c) => (c[0] as string).includes(existingPageId));
    expect(updateCall).toBeDefined();
    expect(updateCall?.[1]?.method).toBe("PATCH");

    // Create new page
    const createCall = calls.find((c) => (c[0] as string).endsWith("/pages") && c[1]?.method === "POST");
    expect(createCall).toBeDefined();
  });

  it("skips PATCH when the page already matches the card", async () => {
    vi.mocked(global.fetch)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          properties: {
            "Glean ID": { type: "rich_text" },
            Content: { type: "rich_text" },
            Thought: { type: "rich_text" },
            Source: { type: "url" },
            Created: { type: "date" },
          },
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          results: [
            {
              id: "page-1",
              last_edited_time: "2023-11-15T00:00:00.000Z",
              properties: {
                Name: { type: "title", title: [{ plain_text: "Example Blog — The only way" }] },
                "Glean ID": { type: "rich_text", rich_text: [{ plain_text: "card-1" }] },
                Content: {
                  type: "rich_text",
                  rich_text: [{ plain_text: sampleCards[0].content }],
                },
                Thought: { type: "rich_text", rich_text: [{ plain_text: "Resonates deeply." }] },
                Source: { type: "url", url: "https://example.com/quote" },
                Created: { type: "date", date: { start: "2023-11-14" } },
              },
            },
          ],
          next_cursor: null,
          has_more: false,
        }),
      } as Response)
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) } as Response); // create card-2

    const result = await notionAdapter.sync(sampleCards, {
      provider: "notion",
      token: "secret_xxx",
      databaseId: "db-1",
    });

    expect(result.ok).toBe(true);
    const calls = vi.mocked(global.fetch).mock.calls;
    // card-1 is unchanged → no PATCH for its page.
    const updateCall = calls.find((c) => (c[0] as string).includes("page-1"));
    expect(updateCall).toBeUndefined();
    // card-2 does not exist remotely → created.
    const createCall = calls.find((c) => (c[0] as string).endsWith("/pages") && c[1]?.method === "POST");
    expect(createCall).toBeDefined();
  });

  it("backfills Glean ID onto a Notion-created page instead of duplicating it", async () => {
    const localCard: Card = {
      id: "notion_page-manual",
      content: "My manual note",
      source: { url: "", title: "" },
      createdAt: 1700000000000,
    };
    vi.mocked(global.fetch)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          properties: {
            "Glean ID": { type: "rich_text" },
            Content: { type: "rich_text" },
            Thought: { type: "rich_text" },
            Source: { type: "url" },
            Created: { type: "date" },
          },
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          results: [
            {
              id: "page-manual",
              last_edited_time: "2026-07-20T10:00:00.000Z",
              properties: {
                Name: { type: "title", title: [{ plain_text: "My manual note" }] },
                "Glean ID": { type: "rich_text", rich_text: [] },
                Content: { type: "rich_text", rich_text: [{ plain_text: "My manual note" }] },
                Thought: { type: "rich_text", rich_text: [] },
                Source: { type: "url", url: null },
                Created: { type: "date", date: { start: "2023-11-14" } },
              },
            },
          ],
          next_cursor: null,
          has_more: false,
        }),
      } as Response)
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) } as Response); // PATCH backfill

    const result = await notionAdapter.sync([localCard], {
      provider: "notion",
      token: "secret_xxx",
      databaseId: "db-1",
    });

    expect(result.ok).toBe(true);
    const calls = vi.mocked(global.fetch).mock.calls;

    // No new page is created — the existing page is matched by derived id.
    const createCall = calls.find((c) => (c[0] as string).endsWith("/pages") && c[1]?.method === "POST");
    expect(createCall).toBeUndefined();

    // The page gets PATCHed only to backfill the missing Glean ID...
    const patchCall = calls.find((c) => (c[0] as string).includes("page-manual") && c[1]?.method === "PATCH");
    expect(patchCall).toBeDefined();
    const body = JSON.parse(patchCall![1]!.body as string);
    expect(body.properties["Glean ID"].rich_text[0].text.content).toBe("notion_page-manual");
    // ...and the user's own page title is never clobbered by an update.
    expect(body.properties.Name).toBeUndefined();
  });

  it("archives duplicate pages sharing one Glean ID and keeps the earliest-created", async () => {
    // The duplicate is listed FIRST in the query response but was created
    // LATER — canonical selection must go by created_time, not query order.
    const staleDup = {
      id: "page-dup",
      created_time: "2026-07-10T10:00:00.000Z",
      last_edited_time: "2026-07-10T10:00:00.000Z",
      properties: {
        Name: { type: "title", title: [{ plain_text: "Example Blog — stale copy" }] },
        "Glean ID": { type: "rich_text", rich_text: [{ plain_text: "card-1" }] },
        Content: { type: "rich_text", rich_text: [{ plain_text: "stale content" }] },
        Thought: { type: "rich_text", rich_text: [] },
        Source: { type: "url", url: null },
        Created: { type: "date", date: { start: "2023-11-14" } },
      },
    };
    const canonical = {
      id: "page-keep",
      created_time: "2026-07-01T10:00:00.000Z",
      last_edited_time: "2023-11-15T00:00:00.000Z",
      properties: {
        Name: { type: "title", title: [{ plain_text: "Example Blog — The only way" }] },
        "Glean ID": { type: "rich_text", rich_text: [{ plain_text: "card-1" }] },
        Content: {
          type: "rich_text",
          rich_text: [{ plain_text: sampleCards[0].content }],
        },
        Thought: { type: "rich_text", rich_text: [{ plain_text: "Resonates deeply." }] },
        Source: { type: "url", url: "https://example.com/quote" },
        Created: { type: "date", date: { start: "2023-11-14" } },
      },
    };
    vi.mocked(global.fetch)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          properties: {
            "Glean ID": { type: "rich_text" },
            Content: { type: "rich_text" },
            Thought: { type: "rich_text" },
            Source: { type: "url" },
            Created: { type: "date" },
          },
        }),
      } as Response)
      .mockResolvedValueOnce(queryResponse([staleDup, canonical]))
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) } as Response); // archive page-dup

    const result = await notionAdapter.sync([sampleCards[0]], {
      provider: "notion",
      token: "secret_xxx",
      databaseId: "db-1",
    });

    expect(result.ok).toBe(true);
    expect(result.dedupedCount).toBe(1);

    const calls = vi.mocked(global.fetch).mock.calls;
    // The later-created duplicate is archived…
    const archiveCall = calls.find(
      (c) => (c[0] as string).includes("page-dup") && c[1]?.method === "PATCH"
    );
    expect(archiveCall).toBeDefined();
    expect(JSON.parse(archiveCall![1]!.body as string)).toEqual({ archived: true });
    // …the canonical page is converged → untouched…
    const keepCall = calls.find((c) => (c[0] as string).includes("page-keep"));
    expect(keepCall).toBeUndefined();
    // …and no new page is created for the card.
    const createCall = calls.find(
      (c) => (c[0] as string).endsWith("/pages") && c[1]?.method === "POST"
    );
    expect(createCall).toBeUndefined();
  });

  it("creates pages under the database's actual (possibly renamed) title property", async () => {
    vi.mocked(global.fetch)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          properties: {
            "标题": { type: "title" },
            "Glean ID": { type: "rich_text" },
            Content: { type: "rich_text" },
            Thought: { type: "rich_text" },
            Source: { type: "url" },
            Created: { type: "date" },
          },
        }),
      } as Response)
      .mockResolvedValueOnce(queryResponse([]))
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) } as Response); // create

    const result = await notionAdapter.sync([sampleCards[0]], {
      provider: "notion",
      token: "secret_xxx",
      databaseId: "db-1",
    });

    expect(result.ok).toBe(true);
    const createCall = vi
      .mocked(global.fetch)
      .mock.calls.find((c) => (c[0] as string).endsWith("/pages") && c[1]?.method === "POST");
    expect(createCall).toBeDefined();
    const body = JSON.parse(createCall![1]!.body as string);
    expect(body.properties["标题"]).toBeDefined();
    expect(body.properties.Name).toBeUndefined();
  });
});

/** Build a Notion query-page JSON object. */
function notionPage(overrides: {
  id: string;
  gleanId?: string;
  name?: string;
  content?: string;
  thought?: string;
  sourceUrl?: string | null;
  created?: string;
  lastEdited?: string;
}) {
  return {
    id: overrides.id,
    last_edited_time: overrides.lastEdited ?? "2026-07-20T10:00:00.000Z",
    properties: {
      Name: { type: "title", title: overrides.name ? [{ plain_text: overrides.name }] : [] },
      "Glean ID": {
        type: "rich_text",
        rich_text: overrides.gleanId ? [{ plain_text: overrides.gleanId }] : [],
      },
      Content: {
        type: "rich_text",
        rich_text: overrides.content ? [{ plain_text: overrides.content }] : [],
      },
      Thought: {
        type: "rich_text",
        rich_text: overrides.thought ? [{ plain_text: overrides.thought }] : [],
      },
      Source: { type: "url", url: overrides.sourceUrl ?? null },
      Created: { type: "date", date: { start: overrides.created ?? "2026-07-20" } },
    },
  };
}

function queryResponse(results: unknown[]) {
  return {
    ok: true,
    json: async () => ({ results, next_cursor: null, has_more: false }),
  } as Response;
}

describe("notionAdapter.pull", () => {
  beforeEach(() => {
    global.fetch = vi.fn();
    chromeStore.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("converts Notion-created pages that have no Glean ID", async () => {
    vi.mocked(global.fetch).mockResolvedValue(
      queryResponse([
        notionPage({ id: "page-manual", name: "My manual note", created: "2026-07-20" }),
      ])
    );

    const result = await notionAdapter.pull!({
      provider: "notion",
      token: "secret_xxx",
      databaseId: "db-1",
    });

    expect(result.ok).toBe(true);
    expect(result.cards).toHaveLength(1);
    const card = result.cards![0];
    expect(card.id).toBe("notion_page-manual");
    expect(card.content).toBe("My manual note");
    expect(card.createdAt).toBe(new Date("2026-07-20").getTime());
    expect(card.updatedAt).toBe(Date.parse("2026-07-20T10:00:00.000Z"));
  });

  it("uses Glean ID, Content property and last_edited_time for Glean pages", async () => {
    vi.mocked(global.fetch).mockResolvedValue(
      queryResponse([
        notionPage({
          id: "page-1",
          gleanId: "card-1",
          name: "Example Blog — hello",
          content: "hello world",
          thought: "a thought",
          sourceUrl: "https://example.com/a",
          created: "2026-07-01",
          lastEdited: "2026-07-21T08:00:00.000Z",
        }),
      ])
    );

    const result = await notionAdapter.pull!({
      provider: "notion",
      token: "secret_xxx",
      databaseId: "db-1",
    });

    expect(result.ok).toBe(true);
    const card = result.cards![0];
    expect(card.id).toBe("card-1");
    expect(card.content).toBe("hello world");
    expect(card.thought).toBe("a thought");
    expect(card.source.url).toBe("https://example.com/a");
    expect(card.source.siteName).toBe("Example Blog");
    expect(card.updatedAt).toBe(Date.parse("2026-07-21T08:00:00.000Z"));
  });

  it("finds the Glean database when no databaseId is configured", async () => {
    vi.mocked(global.fetch)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ results: [{ id: "db-9", title: [{ plain_text: "Glean" }] }] }),
      } as Response)
      .mockResolvedValueOnce(
        queryResponse([notionPage({ id: "page-1", gleanId: "card-1", content: "hi" })])
      );

    const result = await notionAdapter.pull!({ provider: "notion", token: "secret_xxx" });

    expect(result.ok).toBe(true);
    expect(result.databaseId).toBe("db-9");
    expect(result.cards).toHaveLength(1);
  });

  it("reads the title property even when it has been renamed in Notion", async () => {
    const page = notionPage({ id: "page-renamed", name: "改名后的标题" });
    // Rename the title property — Notion databases can call it anything.
    const props = page.properties as Record<string, unknown>;
    props["标题"] = props.Name;
    delete props.Name;

    vi.mocked(global.fetch).mockResolvedValue(queryResponse([page]));

    const result = await notionAdapter.pull!({
      provider: "notion",
      token: "secret_xxx",
      databaseId: "db-1",
    });

    expect(result.ok).toBe(true);
    expect(result.cards).toHaveLength(1);
    expect(result.cards![0].content).toBe("改名后的标题");
  });

  /** Mock fetch so database queries return `pages` and block children return `bodyText`. */
  function mockQueryAndBody(pages: unknown[], bodyText: string) {
    vi.mocked(global.fetch).mockImplementation(async (url) => {
      const u = url as string;
      if (u.includes("/blocks/")) {
        return {
          ok: true,
          json: async () => ({
            results: bodyText
              ? [{ type: "paragraph", paragraph: { rich_text: [{ plain_text: bodyText }] } }]
              : [],
            next_cursor: null,
            has_more: false,
          }),
        } as Response;
      }
      return queryResponse(pages);
    });
  }

  it("rescues records whose quote lives in the page body", async () => {
    // Empty Content property AND empty title — previously dropped entirely.
    mockQueryAndBody([notionPage({ id: "page-body" })], "写在正文里的引文");

    const result = await notionAdapter.pull!({
      provider: "notion",
      token: "secret_xxx",
      databaseId: "db-1",
    });

    expect(result.ok).toBe(true);
    expect(result.cards).toHaveLength(1);
    expect(result.cards![0].id).toBe("notion_page-body");
    expect(result.cards![0].content).toBe("写在正文里的引文");
  });

  it("prefers the body as content and keeps the title as the source name", async () => {
    mockQueryAndBody(
      [notionPage({ id: "page-tb", name: "文章标题" })],
      "正文中的引文"
    );

    const result = await notionAdapter.pull!({
      provider: "notion",
      token: "secret_xxx",
      databaseId: "db-1",
    });

    const card = result.cards![0];
    expect(card.content).toBe("正文中的引文");
    expect(card.source.title).toBe("文章标题");
  });

  it("never fetches bodies for pages that already have Content", async () => {
    mockQueryAndBody(
      [notionPage({ id: "page-c", gleanId: "c1", content: "已有内容" })],
      "不应被读取"
    );

    const result = await notionAdapter.pull!({
      provider: "notion",
      token: "secret_xxx",
      databaseId: "db-1",
    });

    expect(result.cards![0].content).toBe("已有内容");
    const blockCalls = vi
      .mocked(global.fetch)
      .mock.calls.filter((c) => (c[0] as string).includes("/blocks/"));
    expect(blockCalls).toHaveLength(0);
  });

  it("still drops pages with no Content, no title and no body", async () => {
    mockQueryAndBody([notionPage({ id: "page-empty" })], "");

    const result = await notionAdapter.pull!({
      provider: "notion",
      token: "secret_xxx",
      databaseId: "db-1",
    });

    expect(result.ok).toBe(true);
    expect(result.cards).toHaveLength(0);
  });

  it("emits a tombstone for remotely-archived pages, only once", async () => {
    // First pull seeds the sync state with two pages.
    vi.mocked(global.fetch).mockResolvedValueOnce(
      queryResponse([
        notionPage({ id: "page-a", gleanId: "a", content: "A" }),
        notionPage({ id: "page-b", gleanId: "b", content: "B" }),
      ])
    );
    const first = await notionAdapter.pull!({
      provider: "notion",
      token: "secret_xxx",
      databaseId: "db-1",
    });
    expect(first.cards!.map((c) => c.id).sort()).toEqual(["a", "b"]);

    // Page b is archived in Notion → next pull must surface a tombstone.
    vi.mocked(global.fetch).mockResolvedValueOnce(
      queryResponse([notionPage({ id: "page-a", gleanId: "a", content: "A" })])
    );
    const second = await notionAdapter.pull!({
      provider: "notion",
      token: "secret_xxx",
      databaseId: "db-1",
    });
    const tombstone = second.cards!.find((c) => c.id === "b");
    expect(tombstone).toBeDefined();
    expect(tombstone!.deletedAt).toBeGreaterThan(0);

    // The tombstone is emitted once — subsequent pulls stay quiet.
    vi.mocked(global.fetch).mockResolvedValueOnce(
      queryResponse([notionPage({ id: "page-a", gleanId: "a", content: "A" })])
    );
    const third = await notionAdapter.pull!({
      provider: "notion",
      token: "secret_xxx",
      databaseId: "db-1",
    });
    expect(third.cards!.map((c) => c.id)).toEqual(["a"]);
  });
});

describe("gistAdapter", () => {
  it("validates missing token", () => {
    expect(gistAdapter.validate({ provider: "gist", token: "", filename: "glean-backup.json" })).toBe("GitHub token is required");
    expect(gistAdapter.validate({ provider: "gist", token: "ghp_xxx", filename: "glean-backup.json" })).toBeNull();
  });
});

describe("gistAdapter.pull", () => {
  beforeEach(() => {
    global.fetch = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns empty array when no gistId configured", async () => {
    const result = await gistAdapter.pull!({
      provider: "gist",
      token: "ghp_xxx",
      filename: "glean-backup.json",
    });
    expect(result.ok).toBe(true);
    expect(result.cards).toEqual([]);
  });

  it("pulls cards from an existing gist", async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        id: "gist-123",
        files: {
          "glean-backup.json": {
            filename: "glean-backup.json",
            content: JSON.stringify(sampleCards),
          },
        },
      }),
    } as Response);

    const result = await gistAdapter.pull!({
      provider: "gist",
      token: "ghp_xxx",
      gistId: "gist-123",
      filename: "glean-backup.json",
    });

    expect(result.ok).toBe(true);
    expect(result.cards).toHaveLength(2);
    expect(result.cards![0].id).toBe("card-1");
  });

  it("returns error for invalid JSON in gist", async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        id: "gist-123",
        files: {
          "glean-backup.json": {
            filename: "glean-backup.json",
            content: "not-json",
          },
        },
      }),
    } as Response);

    const result = await gistAdapter.pull!({
      provider: "gist",
      token: "ghp_xxx",
      gistId: "gist-123",
      filename: "glean-backup.json",
    });

    expect(result.ok).toBe(false);
    expect(result.error).toContain("Gist");
  });
});

// ── mergeCards unit tests ──

describe("mergeCards", () => {
  const makeCard = (id: string, overrides: Partial<Card> = {}): Card => ({
    id,
    content: `content-${id}`,
    source: { url: "https://example.com", title: "Test" },
    createdAt: 1000,
    ...overrides,
  });

  it("returns local-only cards when remote is empty", () => {
    const local = [makeCard("a"), makeCard("b")];
    const result = mergeCards(local, []);
    expect(result).toHaveLength(2);
    expect(result.map((c) => c.id).sort()).toEqual(["a", "b"]);
  });

  it("returns remote-only cards when local is empty", () => {
    const remote = [makeCard("a"), makeCard("b")];
    const result = mergeCards([], remote);
    expect(result).toHaveLength(2);
    expect(result.map((c) => c.id).sort()).toEqual(["a", "b"]);
  });

  it("takes the card with the later updatedAt for same id", () => {
    const local = [makeCard("a", { updatedAt: 1000, content: "old" })];
    const remote = [makeCard("a", { updatedAt: 2000, content: "new" })];
    const result = mergeCards(local, remote);
    expect(result).toHaveLength(1);
    expect(result[0].content).toBe("new");
  });

  it("keeps local when local updatedAt is later", () => {
    const local = [makeCard("a", { updatedAt: 2000, content: "local-new" })];
    const remote = [makeCard("a", { updatedAt: 1000, content: "remote-old" })];
    const result = mergeCards(local, remote);
    expect(result).toHaveLength(1);
    expect(result[0].content).toBe("local-new");
  });

  it("defaults updatedAt to createdAt when updatedAt is missing", () => {
    const local = [makeCard("a", { createdAt: 2000, content: "local" })];
    const remote = [makeCard("a", { createdAt: 1000, content: "remote" })];
    const result = mergeCards(local, remote);
    expect(result).toHaveLength(1);
    expect(result[0].content).toBe("local");
  });

  it("tombstone wins when deletedAt is later than the other side's updatedAt", () => {
    const local = [makeCard("a", { updatedAt: 1000, deletedAt: 3000 })];
    const remote = [makeCard("a", { updatedAt: 2000 })];
    const result = mergeCards(local, remote);
    expect(result).toHaveLength(1);
    expect(result[0].deletedAt).toBe(3000);
  });

  it("remote tombstone wins when deletedAt is later than local updatedAt", () => {
    const local = [makeCard("a", { updatedAt: 2000 })];
    const remote = [makeCard("a", { updatedAt: 1000, deletedAt: 3000 })];
    const result = mergeCards(local, remote);
    expect(result).toHaveLength(1);
    expect(result[0].deletedAt).toBe(3000);
  });

  it("non-tombstone wins when updatedAt is later than the other's deletedAt", () => {
    const local = [makeCard("a", { updatedAt: 1000, deletedAt: 1500 })];
    const remote = [makeCard("a", { updatedAt: 2000 })];
    const result = mergeCards(local, remote);
    expect(result).toHaveLength(1);
    expect(result[0].deletedAt).toBeUndefined();
    expect(result[0].content).toBe("content-a"); // remote content
  });

  it("prefers tombstone when timestamps are equal and one is a tombstone", () => {
    const local = [makeCard("a", { updatedAt: 1000 })];
    const remote = [makeCard("a", { updatedAt: 1000, deletedAt: 1000 })];
    const result = mergeCards(local, remote);
    expect(result).toHaveLength(1);
    expect(result[0].deletedAt).toBe(1000);
  });

  it("merges cards with different ids from both sides", () => {
    const local = [makeCard("a"), makeCard("b")];
    const remote = [makeCard("b", { updatedAt: 2000, content: "remote-b" }), makeCard("c")];
    const result = mergeCards(local, remote);
    expect(result).toHaveLength(3);
    const byId = new Map(result.map((c) => [c.id, c]));
    expect(byId.get("a")!.content).toBe("content-a");
    expect(byId.get("b")!.content).toBe("remote-b");
    expect(byId.get("c")!.content).toBe("content-c");
  });

  it("keeps the local card when remote is newer but content-identical", () => {
    // Notion pushes bump last_edited_time without changing content; the local
    // copy carries richer source metadata and must not be degraded by the echo.
    const local = [
      makeCard("a", {
        updatedAt: 1000,
        content: "same",
        thought: "same thought",
        source: { url: "https://example.com", title: "Local Title", siteName: "KeepMe" },
      }),
    ];
    const remote = [
      makeCard("a", {
        updatedAt: 2000,
        content: "same",
        thought: "same thought",
        source: { url: "https://example.com", title: "" },
      }),
    ];
    const result = mergeCards(local, remote);
    expect(result).toHaveLength(1);
    expect(result[0].source.siteName).toBe("KeepMe");
  });
});
