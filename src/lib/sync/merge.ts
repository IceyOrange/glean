import { Card } from "@/lib/types";

/** Two cards carry the same user-visible payload (quote, thought, link). */
function sameContent(a: Card, b: Card): boolean {
  return (
    a.content === b.content &&
    (a.thought ?? "") === (b.thought ?? "") &&
    a.source.url === b.source.url
  );
}

/**
 * Merge two card arrays (local + remote) into a single converged result.
 *
 * Rules:
 * 1. Same id: take the record with the later updatedAt. If one side has
 *    deletedAt and its timestamp is later than the other's updatedAt, the
 *    result is a tombstone (keep the deletedAt).
 * 2. Cards present in only one side are included as-is.
 * 3. Cards with no updatedAt default updatedAt to createdAt for comparison.
 * 4. If the remote side wins on timestamp but the content is identical,
 *    keep the local copy — it carries richer source metadata, and remote
 *    timestamps can be bumped by our own writes (Notion last_edited_time).
 *
 * This is a pure function — no side effects, suitable for unit testing.
 */
export function mergeCards(local: Card[], remote: Card[]): Card[] {
  const byId = new Map<string, Card>();

  // Index local cards
  for (const card of local) {
    byId.set(card.id, card);
  }

  // Merge remote cards
  for (const remoteCard of remote) {
    const localCard = byId.get(remoteCard.id);

    if (!localCard) {
      // Remote-only card — include as-is.
      byId.set(remoteCard.id, remoteCard);
      continue;
    }

    // Both sides have the same id — resolve conflict.
    const localTs = localCard.updatedAt ?? localCard.createdAt;
    const remoteTs = remoteCard.updatedAt ?? remoteCard.createdAt;

    if (remoteTs > localTs) {
      // Remote is newer, but check if local has a later tombstone.
      if (localCard.deletedAt && localCard.deletedAt > remoteTs) {
        // Local tombstone is the most recent event — keep tombstone.
        // (already in byId as localCard)
      } else if (!remoteCard.deletedAt && !localCard.deletedAt && sameContent(localCard, remoteCard)) {
        // Timestamp echo with no content change — keep the richer local copy.
        // (Does not apply when either side is a tombstone: a live card that is
        // newer than the local tombstone must resurrect the card.)
      } else {
        byId.set(remoteCard.id, remoteCard);
      }
    } else if (localTs > remoteTs) {
      // Local is newer, but check if remote has a later tombstone.
      if (remoteCard.deletedAt && remoteCard.deletedAt > localTs) {
        // Remote tombstone is the most recent event — apply it.
        byId.set(remoteCard.id, remoteCard);
      }
      // else: local is already in byId and is newer — keep it.
    } else {
      // Same timestamp — if one is a tombstone, prefer tombstone (conservative).
      if (remoteCard.deletedAt && !localCard.deletedAt) {
        byId.set(remoteCard.id, remoteCard);
      }
    }
  }

  return Array.from(byId.values());
}
