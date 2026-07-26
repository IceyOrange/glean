import { describe, it, expect, beforeEach } from "vitest";
import { getCards, saveCard, deleteCard, restoreCard, updateCard, _resetCache } from "./storage";
import type { Card } from "./types";

function makeChrome() {
  let store: Record<string, unknown> = {};
  const listeners: Array<(changes: Record<string, { oldValue: unknown; newValue: unknown }>, area: string) => void> = [];
  return {
    storage: {
      local: {
        get: async (keys?: string | string[] | null) => {
          if (keys == null) return { ...store };
          if (typeof keys === "string") return { [keys]: store[keys] };
          return Object.fromEntries(keys.map((k) => [k, store[k]]));
        },
        set: async (obj: Record<string, unknown>) => {
          const oldStore = { ...store };
          store = { ...store, ...obj };
          const changes: Record<string, { oldValue: unknown; newValue: unknown }> = {};
          for (const key of Object.keys(obj)) {
            changes[key] = { oldValue: oldStore[key], newValue: store[key] };
          }
          for (const fn of listeners) fn(changes, "local");
        },
        remove: async (k: string) => {
          delete store[k];
        },
      },
      onChanged: {
        addListener: (fn: (changes: Record<string, { oldValue: unknown; newValue: unknown }>, area: string) => void) => { listeners.push(fn); },
        removeListener: () => {},
      },
    },
  };
}

const makeCard = (id: string, createdAt = 0): Card => ({
  id,
  content: `content-${id}`,
  source: { url: "https://example.com", title: `title-${id}` },
  createdAt,
});

beforeEach(() => {
  _resetCache();
  (globalThis as unknown as { chrome: unknown }).chrome = makeChrome();
});

describe("storage", () => {
  it("saveCard unshifts newest first and assigns id/createdAt", async () => {
    await saveCard({ content: "a", source: { url: "u1", title: "t1" } });
    await saveCard({ content: "b", source: { url: "u2", title: "t2" } });
    const cards = await getCards();
    expect(cards.map((c) => c.content)).toEqual(["b", "a"]);
    expect(cards[0].id).toBeTruthy();
    expect(cards[0].createdAt).toBeGreaterThan(0);
  });

  it("deleteCard removes only the target", async () => {
    const a = await saveCard({ content: "a", source: { url: "u1", title: "t1" } });
    await saveCard({ content: "b", source: { url: "u2", title: "t2" } });
    await deleteCard(a.id);
    const cards = await getCards();
    expect(cards.map((c) => c.content)).toEqual(["b"]);
  });

  it("restoreCard re-inserts at the original index", async () => {
    const c1 = makeCard("1");
    const c2 = makeCard("2");
    const c3 = makeCard("3");
    for (const c of [c3, c2, c1]) {
      // unshift order: c1, c2, c3
      const cards = await getCards();
      await chrome.storage.local.set({ glean_cards: [c, ...cards] });
    }
    await deleteCard("2");
    await restoreCard(c2, 1);
    const cards = await getCards();
    expect(cards.map((c) => c.id)).toEqual(["1", "2", "3"]);
  });

  it("restoreCard is a no-op when the card already exists", async () => {
    const c1 = makeCard("1");
    await chrome.storage.local.set({ glean_cards: [c1] });
    await restoreCard(c1, 0);
    expect((await getCards()).length).toBe(1);
  });

  it("updateCard merges thought and partial source", async () => {
    const saved = await saveCard({ content: "a", source: { url: "u", title: "t" } });
    await updateCard(saved.id, { thought: "note", source: { author: "me" } });
    const [card] = await getCards();
    expect(card.thought).toBe("note");
    expect(card.source.author).toBe("me");
    expect(card.source.url).toBe("u");
  });

  it("write-queue propagates set() errors to the caller (C1)", async () => {
    const chrome = (globalThis as unknown as { chrome: unknown }).chrome as {
      storage: { local: { set: (o: Record<string, unknown>) => Promise<void> } };
    };
    const originalSet = chrome.storage.local.set;
    chrome.storage.local.set = async () => {
      throw new Error("quota exceeded");
    };
    await expect(
      saveCard({ content: "x", source: { url: "u", title: "t" } })
    ).rejects.toThrow("quota exceeded");
    chrome.storage.local.set = originalSet;
  });

  it("write-queue stays usable after a failed write", async () => {
    const chrome = (globalThis as unknown as { chrome: unknown }).chrome as {
      storage: { local: { set: (o: Record<string, unknown>) => Promise<void> } };
    };
    const originalSet = chrome.storage.local.set;
    chrome.storage.local.set = async () => {
      throw new Error("fail");
    };
    await expect(
      saveCard({ content: "x", source: { url: "u", title: "t" } })
    ).rejects.toThrow();
    chrome.storage.local.set = originalSet;
    // Next write should succeed and be readable.
    await saveCard({ content: "y", source: { url: "u", title: "t" } });
    const cards = await getCards();
    expect(cards.some((c) => c.content === "y")).toBe(true);
  });

  it("getCards serves from cache after first read", async () => {
    const chromeObj = (globalThis as unknown as { chrome: unknown }).chrome as {
      storage: { local: { get: (k: string) => Promise<Record<string, unknown>> } };
    };
    // Write directly to storage (bypassing the in-memory cache) so the first
    // getCards() is forced to read from storage and populate the cache.
    await chrome.storage.local.set({
      glean_cards: [makeCard("seed")],
    });
    _resetCache(); // ensure cache is cold

    const originalGet = chromeObj.storage.local.get;
    let readCount = 0;
    chromeObj.storage.local.get = async (key: string) => {
      readCount++;
      return originalGet(key);
    };
    await getCards();
    await getCards();
    // Second call hits the cache — no storage read.
    expect(readCount).toBe(1);
    chromeObj.storage.local.get = originalGet;
  });

  it("onChanged listener refreshes the cache when storage is mutated externally", async () => {
    await saveCard({ content: "a", source: { url: "u", title: "t" } });
    const before = await getCards();
    expect(before.length).toBe(1);
    // Simulate an external write (e.g. sync) into storage — the onChanged
    // listener must update the in-memory cache so the next getCards reflects it.
    await chrome.storage.local.set({
      glean_cards: [
        { id: "ext", content: "external", source: { url: "u", title: "t" }, createdAt: 9 },
      ],
    });
    const after = await getCards();
    expect(after.map((c) => c.id)).toEqual(["ext"]);
  });

  it("restoreCard clamps an out-of-range index to the end", async () => {
    const c1 = makeCard("1");
    await chrome.storage.local.set({ glean_cards: [c1] });
    const c2 = makeCard("2");
    await restoreCard(c2, 999);
    const cards = await getCards();
    expect(cards.map((c) => c.id)).toEqual(["1", "2"]);
  });
});
