import { Card } from "./types";
import { nanoid } from "nanoid";

const STORAGE_KEY = "glean_cards";

let writeQueue: Promise<void> = Promise.resolve();

export async function getCards(): Promise<Card[]> {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  return (result[STORAGE_KEY] as Card[]) ?? [];
}

export async function saveCard(
  card: Omit<Card, "id" | "createdAt">
): Promise<Card> {
  const queued = writeQueue.then(async () => {
    const cards = await getCards();
    const newCard: Card = {
      ...card,
      id: nanoid(),
      createdAt: Date.now(),
    };
    cards.unshift(newCard);
    await chrome.storage.local.set({ [STORAGE_KEY]: cards });
    return newCard;
  });
  writeQueue = queued.then(() => {}, () => {});
  return queued;
}

export async function deleteCard(id: string): Promise<void> {
  const queued = writeQueue.then(async () => {
    const cards = await getCards();
    const filtered = cards.filter((c) => c.id !== id);
    await chrome.storage.local.set({ [STORAGE_KEY]: filtered });
  });
  writeQueue = queued.then(() => {}, () => {});
  return queued;
}

export async function deleteCards(ids: string[]): Promise<void> {
  const queued = writeQueue.then(async () => {
    const cards = await getCards();
    const idSet = new Set(ids);
    const filtered = cards.filter((c) => !idSet.has(c.id));
    await chrome.storage.local.set({ [STORAGE_KEY]: filtered });
  });
  writeQueue = queued.then(() => {}, () => {});
  return queued;
}

/** Re-insert a previously deleted card at its original position. */
export async function restoreCard(card: Card, index: number): Promise<void> {
  const queued = writeQueue.then(async () => {
    const cards = await getCards();
    if (cards.some((c) => c.id === card.id)) return;
    const next = [...cards];
    next.splice(Math.min(index, next.length), 0, card);
    await chrome.storage.local.set({ [STORAGE_KEY]: next });
  });
  writeQueue = queued.then(() => {}, () => {});
  return queued;
}

export async function updateCard(
  id: string,
  updates: Partial<Pick<Card, "content" | "thought">> & { source?: Partial<Card["source"]> }
): Promise<void> {
  const queued = writeQueue.then(async () => {
    const cards = await getCards();
    const index = cards.findIndex((c) => c.id === id);
    if (index === -1) return;
    cards[index] = {
      ...cards[index],
      ...updates,
      source: updates.source
        ? { ...cards[index].source, ...Object.fromEntries(Object.entries(updates.source).filter(([, v]) => v !== undefined)) }
        : cards[index].source,
    };
    await chrome.storage.local.set({ [STORAGE_KEY]: cards });
  });
  writeQueue = queued.then(() => {}, () => {});
  return queued;
}
