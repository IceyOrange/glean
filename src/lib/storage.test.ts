import { describe, it, expect, beforeEach } from "vitest";
import { getCards, saveCard, deleteCard, restoreCard, updateCard } from "./storage";
import type { Card } from "./types";

function makeChrome() {
  let store: Record<string, unknown> = {};
  return {
    storage: {
      local: {
        get: async (keys?: string | string[] | null) => {
          if (keys == null) return { ...store };
          if (typeof keys === "string") return { [keys]: store[keys] };
          return Object.fromEntries(keys.map((k) => [k, store[k]]));
        },
        set: async (obj: Record<string, unknown>) => {
          store = { ...store, ...obj };
        },
        remove: async (k: string) => {
          delete store[k];
        },
      },
      onChanged: { addListener: () => {}, removeListener: () => {} },
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
});
