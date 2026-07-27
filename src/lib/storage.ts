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

/** Get all cards including tombstones (for sync use). */
export async function getCards(): Promise<Card[]> {
  registerChangeListener();
  if (cache !== null) return [...cache];
  const result = await chrome.storage.local.get(STORAGE_KEY);
  cache = (result[STORAGE_KEY] as Card[]) ?? [];
  return [...cache];
}

/** Get only active cards (tombstones filtered out) — for UI use. */
export async function getActiveCards(): Promise<Card[]> {
  const all = await getCards();
  return all.filter((c) => !c.deletedAt);
}

/** Get deleted cards for the Journal trash, newest deletion first. */
export async function getDeletedCards(): Promise<Card[]> {
  const all = await getCards();
  return all
    .filter((c) => !!c.deletedAt)
    .sort((a, b) => (b.deletedAt ?? 0) - (a.deletedAt ?? 0));
}

export interface SaveCardResult {
  card: Card;
  duplicated: boolean;
}

export async function saveCard(
  card: Omit<Card, "id" | "createdAt" | "updatedAt">
): Promise<SaveCardResult> {
  const queued = writeQueue.then(async () => {
    const cards = await getCards();

    // Lightweight dedup: if a card with the same content and source.url was
    // saved within the last 5 minutes, return it as a duplicate instead of
    // creating a new one.
    const now = Date.now();
    const FIVE_MIN = 5 * 60 * 1000;
    const dup = cards.find(
      (c) =>
        !c.deletedAt &&
        c.content === card.content &&
        c.source.url === card.source.url &&
        now - c.createdAt < FIVE_MIN
    );
    if (dup) {
      return { card: dup, duplicated: true };
    }

    const newCard: Card = {
      ...card,
      id: nanoid(),
      createdAt: now,
      updatedAt: now,
    };
    cards.unshift(newCard);
    await chrome.storage.local.set({ [STORAGE_KEY]: cards });
    cache = cards;
    return { card: newCard, duplicated: false };
  });
  writeQueue = queued.then(noop, noop);
  return queued;
}

/** Soft-delete a card by setting deletedAt. */
export async function deleteCard(id: string): Promise<void> {
  const queued = writeQueue.then(async () => {
    const cards = await getCards();
    const index = cards.findIndex((c) => c.id === id);
    if (index === -1) return;
    cards[index] = { ...cards[index], deletedAt: Date.now() };
    await chrome.storage.local.set({ [STORAGE_KEY]: cards });
    cache = cards;
  });
  writeQueue = queued.then(noop, noop);
  return queued;
}

/** Soft-delete multiple cards by setting deletedAt. */
export async function deleteCards(ids: string[]): Promise<void> {
  const queued = writeQueue.then(async () => {
    const cards = await getCards();
    const idSet = new Set(ids);
    const now = Date.now();
    for (let i = 0; i < cards.length; i++) {
      if (idSet.has(cards[i].id)) {
        cards[i] = { ...cards[i], deletedAt: now };
      }
    }
    await chrome.storage.local.set({ [STORAGE_KEY]: cards });
    cache = cards;
  });
  writeQueue = queued.then(noop, noop);
  return queued;
}

/** Re-insert a previously soft-deleted card at its original position (undo). */
export async function restoreCard(card: Card, index: number): Promise<void> {
  const queued = writeQueue.then(async () => {
    const cards = await getCards();
    const existing = cards.find((c) => c.id === card.id);
    if (existing) {
      // Clear the tombstone on the existing entry (undo soft-delete).
      const idx = cards.indexOf(existing);
      cards[idx] = { ...existing, deletedAt: undefined };
      await chrome.storage.local.set({ [STORAGE_KEY]: cards });
      cache = cards;
      return;
    }
    // Card was physically removed (shouldn't happen with soft-delete, but
    // keep as safety net): re-insert at the given index.
    const next = [...cards];
    const restored: Card = { ...card, deletedAt: undefined };
    next.splice(Math.min(index, next.length), 0, restored);
    await chrome.storage.local.set({ [STORAGE_KEY]: next });
    cache = next;
  });
  writeQueue = queued.then(noop, noop);
  return queued;
}

/** Restore a card already present as a tombstone. */
export async function restoreDeletedCard(id: string): Promise<void> {
  const cards = await getCards();
  const card = cards.find((candidate) => candidate.id === id);
  if (card) await restoreCard(card, cards.indexOf(card));
}

/** Permanently delete one tombstone from local storage. */
export async function permanentlyDeleteCard(id: string): Promise<void> {
  const queued = writeQueue.then(async () => {
    const cards = await getCards();
    const next = cards.filter((card) => card.id !== id);
    if (next.length === cards.length) return;
    await chrome.storage.local.set({ [STORAGE_KEY]: next });
    cache = next;
  });
  writeQueue = queued.then(noop, noop);
  return queued;
}

export interface ImportCardsResult {
  added: number;
  updated: number;
  skipped: number;
}

function normaliseImportedCard(value: unknown): Card | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const source = raw.source;
  if (
    typeof raw.content !== "string" || !raw.content.trim() ||
    !source || typeof source !== "object" ||
    typeof (source as Record<string, unknown>).url !== "string"
  ) return null;

  const sourceRaw = source as Record<string, unknown>;
  const now = Date.now();
  const createdAt = typeof raw.createdAt === "number" && Number.isFinite(raw.createdAt)
    ? raw.createdAt
    : now;
  const updatedAt = typeof raw.updatedAt === "number" && Number.isFinite(raw.updatedAt)
    ? raw.updatedAt
    : createdAt;
  const optionalString = (key: string) => typeof sourceRaw[key] === "string" ? sourceRaw[key] : undefined;

  return {
    id: typeof raw.id === "string" && raw.id ? raw.id : nanoid(),
    content: raw.content,
    thought: typeof raw.thought === "string" ? raw.thought : undefined,
    source: {
      url: sourceRaw.url as string,
      title: typeof sourceRaw.title === "string" ? sourceRaw.title : sourceRaw.url as string,
      heading: optionalString("heading"),
      siteName: optionalString("siteName"),
      author: optionalString("author"),
      publishedAt: optionalString("publishedAt"),
      favicon: optionalString("favicon"),
    },
    createdAt,
    updatedAt,
    deletedAt: typeof raw.deletedAt === "number" && Number.isFinite(raw.deletedAt) ? raw.deletedAt : undefined,
  };
}

/**
 * Import a JSON export without overwriting newer local changes. Cards are
 * matched by id; an incoming record only wins when its updated timestamp is
 * newer. Invalid records are skipped rather than aborting the whole import.
 */
export async function importCards(rawCards: unknown): Promise<ImportCardsResult> {
  const values = Array.isArray(rawCards) ? rawCards : [];
  const queued = writeQueue.then(async () => {
    const cards = await getCards();
    const byId = new Map(cards.map((card, index) => [card.id, index]));
    let added = 0;
    let updated = 0;
    let skipped = 0;

    for (const value of values) {
      const imported = normaliseImportedCard(value);
      if (!imported) {
        skipped++;
        continue;
      }
      const index = byId.get(imported.id);
      if (index === undefined) {
        cards.unshift(imported);
        byId.set(imported.id, 0);
        // Array indexes have shifted; rebuild the small map for correctness.
        cards.forEach((card, nextIndex) => byId.set(card.id, nextIndex));
        added++;
        continue;
      }
      const current = cards[index];
      const incomingTs = imported.updatedAt ?? imported.createdAt;
      const currentTs = current.updatedAt ?? current.createdAt;
      if (incomingTs > currentTs) {
        cards[index] = imported;
        updated++;
      } else {
        skipped++;
      }
    }
    if (added || updated) {
      await chrome.storage.local.set({ [STORAGE_KEY]: cards });
      cache = cards;
    }
    return { added, updated, skipped };
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
      updatedAt: Date.now(),
    };
    await chrome.storage.local.set({ [STORAGE_KEY]: cards });
    cache = cards;
  });
  writeQueue = queued.then(noop, noop);
  return queued;
}

/** Replace all cards in storage (used by sync after merge). */
export async function saveAllCards(cards: Card[]): Promise<void> {
  const queued = writeQueue.then(async () => {
    await chrome.storage.local.set({ [STORAGE_KEY]: cards });
    cache = cards;
  });
  writeQueue = queued.then(noop, noop);
  return queued;
}

/** Tombstone retention period in milliseconds (30 days). */
export const TOMBSTONE_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Physically remove tombstones older than the retention period.
 * Returns the number of pruned tombstones.
 */
export async function pruneTombstones(
  retentionMs: number = TOMBSTONE_RETENTION_MS
): Promise<number> {
  const queued = writeQueue.then(async () => {
    const cards = await getCards();
    const cutoff = Date.now() - retentionMs;
    const before = cards.length;
    const pruned = cards.filter(
      (c) => !(c.deletedAt && c.deletedAt < cutoff)
    );
    if (pruned.length === before) return 0;
    await chrome.storage.local.set({ [STORAGE_KEY]: pruned });
    cache = pruned;
    return before - pruned.length;
  });
  writeQueue = queued.then(noop, noop);
  return queued;
}
