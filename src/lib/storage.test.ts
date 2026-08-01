import { describe, it, expect, beforeEach } from "vitest";
import {
  getCards,
  getActiveCards,
  saveCard,
  deleteCard,
  deleteCards,
  restoreCard,
  restoreDeletedCard,
  permanentlyDeleteCard,
  getDeletedCards,
  importCards,
  updateCard,
  saveAllCards,
  pruneTombstones,
  _resetCache,
} from "./storage";
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

const makeCard = (id: string, createdAt = 0, overrides: Partial<Card> = {}): Card => ({
  id,
  content: `content-${id}`,
  source: { url: "https://example.com", title: `title-${id}` },
  createdAt,
  ...overrides,
});

beforeEach(() => {
  _resetCache();
  (globalThis as unknown as { chrome: unknown }).chrome = makeChrome();
});

describe("storage", () => {
  it("saveCard unshifts newest first and assigns id/createdAt/updatedAt", async () => {
    const r1 = await saveCard({ content: "a", source: { url: "u1", title: "t1" } });
    const r2 = await saveCard({ content: "b", source: { url: "u2", title: "t2" } });
    expect(r1.duplicated).toBe(false);
    expect(r2.duplicated).toBe(false);
    const cards = await getCards();
    expect(cards.map((c) => c.content)).toEqual(["b", "a"]);
    expect(cards[0].id).toBeTruthy();
    expect(cards[0].createdAt).toBeGreaterThan(0);
    expect(cards[0].updatedAt).toBeGreaterThan(0);
  });

  it("saveCard deduplicates within 5 minutes", async () => {
    const result1 = await saveCard({ content: "same", source: { url: "u1", title: "t1" } });
    expect(result1.duplicated).toBe(false);
    const result2 = await saveCard({ content: "same", source: { url: "u1", title: "t1" } });
    expect(result2.duplicated).toBe(true);
    expect(result2.card.id).toBe(result1.card.id);
    // Only one card in storage
    const cards = await getCards();
    expect(cards).toHaveLength(1);
  });

  it("saveCard does not deduplicate after 5 minutes", async () => {
    await saveCard({ content: "same", source: { url: "u1", title: "t1" } });
    // Manually backdate the card's createdAt to simulate 6 minutes ago
    const cards = await getCards();
    const backdated: Card[] = [{ ...cards[0], createdAt: Date.now() - 6 * 60 * 1000 }];
    await chrome.storage.local.set({ glean_cards: backdated });
    _resetCache();

    const r2 = await saveCard({ content: "same", source: { url: "u1", title: "t1" } });
    expect(r2.duplicated).toBe(false);
  });

  it("deleteCard soft-deletes by setting deletedAt", async () => {
    const { card: a } = await saveCard({ content: "a", source: { url: "u1", title: "t1" } });
    await saveCard({ content: "b", source: { url: "u2", title: "t2" } });
    await deleteCard(a.id);
    const cards = await getCards();
    // Card still exists but has deletedAt
    const deleted = cards.find((c) => c.id === a.id);
    expect(deleted).toBeDefined();
    expect(deleted!.deletedAt).toBeGreaterThan(0);
    // getActiveCards should not include it
    const active = await getActiveCards();
    expect(active.map((c) => c.content)).toEqual(["b"]);
  });

  it("deleteCards soft-deletes multiple cards", async () => {
    const { card: a } = await saveCard({ content: "a", source: { url: "u1", title: "t1" } });
    const { card: b } = await saveCard({ content: "b", source: { url: "u2", title: "t2" } });
    await saveCard({ content: "c", source: { url: "u3", title: "t3" } });
    await deleteCards([a.id, b.id]);
    const active = await getActiveCards();
    expect(active.map((c) => c.content)).toEqual(["c"]);
    const all = await getCards();
    expect(all).toHaveLength(3); // still in storage with tombstones
  });

  it("restoreCard clears deletedAt (undo soft-delete)", async () => {
    const { card: a } = await saveCard({ content: "a", source: { url: "u1", title: "t1" } });
    await deleteCard(a.id);
    let active = await getActiveCards();
    expect(active).toHaveLength(0);
    await restoreCard(a, 0);
    active = await getActiveCards();
    expect(active).toHaveLength(1);
    expect(active[0].deletedAt).toBeUndefined();
  });

  it("restoreCard re-inserts a physically missing card", async () => {
    const c1 = makeCard("1");
    const c2 = makeCard("2");
    const c3 = makeCard("3");
    for (const c of [c3, c2, c1]) {
      const cards = await getCards();
      await chrome.storage.local.set({ glean_cards: [c, ...cards] });
    }
    // Physically remove card 2 (simulating pre-soft-delete behavior)
    const all = await getCards();
    const filtered = all.filter((c) => c.id !== "2");
    await chrome.storage.local.set({ glean_cards: filtered });
    _resetCache();
    await restoreCard(c2, 1);
    const cards = await getCards();
    expect(cards.map((c) => c.id)).toEqual(["1", "2", "3"]);
    expect(cards.find((c) => c.id === "2")!.deletedAt).toBeUndefined();
  });

  it("restoreCard is a no-op when the card already exists and is active", async () => {
    const c1 = makeCard("1");
    await chrome.storage.local.set({ glean_cards: [c1] });
    await restoreCard(c1, 0);
    expect((await getCards()).length).toBe(1);
  });

  it("updateCard merges thought, partial source, and sets updatedAt", async () => {
    const { card: saved } = await saveCard({ content: "a", source: { url: "u", title: "t" } });
    const beforeUpdate = (await getCards())[0];
    expect(beforeUpdate.updatedAt).toBeGreaterThan(0);
    // Wait a tick so updatedAt changes
    await new Promise((r) => setTimeout(r, 2));
    await updateCard(saved.id, { thought: "note", source: { author: "me" } });
    const [card] = await getCards();
    expect(card.thought).toBe("note");
    expect(card.source.author).toBe("me");
    expect(card.source.url).toBe("u");
    expect(card.updatedAt).toBeGreaterThanOrEqual(beforeUpdate.updatedAt!);
  });

  it("getActiveCards filters out tombstones", async () => {
    const c1 = makeCard("1");
    const c2 = makeCard("2", 0, { deletedAt: 999 });
    const c3 = makeCard("3");
    await chrome.storage.local.set({ glean_cards: [c1, c2, c3] });
    _resetCache();
    const active = await getActiveCards();
    expect(active.map((c) => c.id)).toEqual(["1", "3"]);
  });

  it("saveAllCards replaces all cards in storage", async () => {
    await saveCard({ content: "old", source: { url: "u1", title: "t1" } });
    const newCards = [makeCard("x"), makeCard("y")];
    await saveAllCards(newCards);
    const cards = await getCards();
    expect(cards.map((c) => c.id)).toEqual(["x", "y"]);
  });

  it("pruneTombstones removes expired tombstones", async () => {
    const oldTombstone = makeCard("1", 0, { deletedAt: Date.now() - 31 * 24 * 60 * 60 * 1000 });
    const recentTombstone = makeCard("2", 0, { deletedAt: Date.now() - 1000 });
    const active = makeCard("3");
    await chrome.storage.local.set({ glean_cards: [oldTombstone, recentTombstone, active] });
    _resetCache();
    const pruned = await pruneTombstones();
    expect(pruned).toBe(1);
    const cards = await getCards();
    expect(cards.map((c) => c.id)).toEqual(["2", "3"]);
  });

  it("pruneTombstones keeps all cards when no tombstones are expired", async () => {
    const recentTombstone = makeCard("1", 0, { deletedAt: Date.now() - 1000 });
    const active = makeCard("2");
    await chrome.storage.local.set({ glean_cards: [recentTombstone, active] });
    _resetCache();
    const pruned = await pruneTombstones();
    expect(pruned).toBe(0);
    const cards = await getCards();
    expect(cards).toHaveLength(2);
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

  it("lists, restores, and permanently removes tombstones for the trash", async () => {
    const first = makeCard("first", 1, { deletedAt: 10 });
    const second = makeCard("second", 2, { deletedAt: 20 });
    await saveAllCards([first, second]);
    expect((await getDeletedCards()).map((card) => card.id)).toEqual(["second", "first"]);
    await restoreDeletedCard("first");
    expect((await getActiveCards()).map((card) => card.id)).toEqual(["first"]);
    await permanentlyDeleteCard("second");
    expect((await getCards()).map((card) => card.id)).toEqual(["first"]);
  });

  it("imports valid cards without replacing a newer local revision", async () => {
    await saveAllCards([makeCard("existing", 1, { updatedAt: 100, content: "new local" })]);
    const result = await importCards([
      makeCard("existing", 1, { updatedAt: 90, content: "old backup" }),
      makeCard("incoming", 2, { updatedAt: 200 }),
      { content: "missing source" },
    ]);
    expect(result).toEqual({ added: 1, updated: 0, skipped: 2 });
    const cards = await getCards();
    expect(cards.find((card) => card.id === "existing")?.content).toBe("new local");
    expect(cards.find((card) => card.id === "incoming")).toBeDefined();
  });
});
