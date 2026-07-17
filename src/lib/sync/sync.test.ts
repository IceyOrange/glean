import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { notionAdapter } from "./notion";
import { nutstoreAdapter } from "./nutstore";
import { Card } from "@/lib/types";

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
    expect(notionAdapter.validate({ token: "" })).toBe("Integration token is required");
    expect(notionAdapter.validate({ token: "secret_xxx" })).toBeNull();
  });
});

describe("nutstoreAdapter", () => {
  it("validates required fields", () => {
    expect(nutstoreAdapter.validate({
      serverUrl: "",
      username: "user",
      password: "pass",
      remotePath: "/Glean/",
    })).toBe("Server URL is required");

    expect(nutstoreAdapter.validate({
      serverUrl: "https://dav.jianguoyun.com/dav/",
      username: "",
      password: "pass",
      remotePath: "/Glean/",
    })).toBe("Username is required");

    expect(nutstoreAdapter.validate({
      serverUrl: "https://dav.jianguoyun.com/dav/",
      username: "user",
      password: "",
      remotePath: "/Glean/",
    })).toBe("Password is required");

    expect(nutstoreAdapter.validate({
      serverUrl: "https://dav.jianguoyun.com/dav/",
      username: "user",
      password: "pass",
      remotePath: "",
    })).toBe("Remote path is required");

    expect(nutstoreAdapter.validate({
      serverUrl: "https://dav.jianguoyun.com/dav/",
      username: "user",
      password: "pass",
      remotePath: "/Glean/",
    })).toBeNull();
  });
});

describe("nutstoreAdapter.sync", () => {
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

    const result = await nutstoreAdapter.sync(sampleCards, {
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

    const result = await nutstoreAdapter.sync(sampleCards, {
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

    const result = await notionAdapter.sync(sampleCards, { token: "secret_xxx" });

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

    const result = await notionAdapter.sync(sampleCards, { token: "secret_xxx" });

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
});
