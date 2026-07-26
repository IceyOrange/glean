import { Card } from "./types";
import { nanoid } from "nanoid";

const STORAGE_KEY = "glean_cards";

/** Swallow resolution/rejection so the write-queue chain never breaks on error. */
const noop = () => {};

let writeQueue: Promise<void> = Promise.resolve();

/** In-memory cache to avoid full storage reads on every mutation. */
let cache: Card[] | null = null;
let listenerRegistered = false;

function registerChangeListener(): void {
  if (listenerRegistered) return;
  if (typeof chrome !== "undefined" && chrome.storage?.onChanged) {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === "local" && STORAGE_KEY in changes) {
        cache = (changes[STORAGE_KEY].newValue as Card[] | undefined) ?? null;
      }
    });
    listenerRegistered = true;
  }
}

/** @internal Reset module-level cache & listener state (for testing). */
export function _resetCache(): void {
  cache = null;
  listenerRegistered = false;
}

export async function getCards(): Promise<Card[]> {
  registerChangeListener();
  if (cache !== null) return [...cache];
  const result = await chrome.storage.local.get(STORAGE_KEY);
  cache = (result[STORAGE_KEY] as Card[]) ?? [];
  return [...cache];
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
    cache = cards;
    return newCard;
  });
  writeQueue = queued.then(noop, noop);
  return queued;
}

export async function deleteCard(id: string): Promise<void> {
  const queued = writeQueue.then(async () => {
    const cards = await getCards();
    const filtered = cards.filter((c) => c.id !== id);
    await chrome.storage.local.set({ [STORAGE_KEY]: filtered });
    cache = filtered;
  });
  writeQueue = queued.then(noop, noop);
  return queued;
}

export async function deleteCards(ids: string[]): Promise<void> {
  const queued = writeQueue.then(async () => {
    const cards = await getCards();
    const idSet = new Set(ids);
    const filtered = cards.filter((c) => !idSet.has(c.id));
    await chrome.storage.local.set({ [STORAGE_KEY]: filtered });
    cache = filtered;
  });
  writeQueue = queued.then(noop, noop);
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
    cache = next;
  });
  writeQueue = queued.then(noop, noop);
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
    cache = cards;
  });
  writeQueue = queued.then(noop, noop);
  return queued;
}
