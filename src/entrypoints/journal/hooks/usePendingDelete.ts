import { useState, useRef, useCallback } from "react";
import { Card } from "@/lib/types";
import { deleteCard, deleteCards, restoreCard } from "@/lib/storage";
import { deleteAskHistory } from "@/lib/ai";
import type { PendingDelete } from "@/components/journal/UndoToast";

/**
 * Manages the pending-delete toast: single/batch soft-delete with undo,
 * auto-dismiss timer, and hover-pause behaviour.
 *
 * Deletion is now soft (sets deletedAt tombstone). Undo clears the tombstone.
 * Physical removal is handled by pruneTombstones() during sync.
 */
export function usePendingDelete() {
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);
  const pendingDeleteRef = useRef<PendingDelete | null>(null);
  const deleteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearDeleteTimer = useCallback(() => {
    if (deleteTimerRef.current) {
      clearTimeout(deleteTimerRef.current);
      deleteTimerRef.current = null;
    }
  }, []);

  const scheduleToastDismiss = useCallback(() => {
    clearDeleteTimer();
    deleteTimerRef.current = setTimeout(() => {
      pendingDeleteRef.current = null;
      setPendingDelete(null);
    }, 4500);
  }, [clearDeleteTimer]);

  const handleDelete = useCallback(
    async (
      id: string,
      cards: Card[],
      expandedId: string | null,
      askCardId: string | null,
      onExpandedChange: (id: string | null) => void,
      onAskReset: () => void,
    ) => {
      const index = cards.findIndex((c) => c.id === id);
      if (index === -1) return;
      const card = cards[index];
      if (expandedId === id) onExpandedChange(null);
      if (askCardId === id) onAskReset();
      void deleteAskHistory(id);
      // Soft-delete: sets deletedAt tombstone
      await deleteCard(id);
      const payload: PendingDelete = { type: "single", card, index };
      pendingDeleteRef.current = payload;
      setPendingDelete(payload);
      scheduleToastDismiss();
    },
    [scheduleToastDismiss],
  );

  const handleBatchDelete = useCallback(
    async (
      cards: Card[],
      selectedIds: Set<string>,
      expandedId: string | null,
      askCardId: string | null,
      onExpandedChange: (id: string | null) => void,
      onAskReset: () => void,
      onSelectionCleared: () => void,
    ) => {
      if (selectedIds.size === 0) return;
      const ids = Array.from(selectedIds);
      const items = ids
        .map((id) => {
          const index = cards.findIndex((c) => c.id === id);
          const card = cards.find((c) => c.id === id);
          return card ? { card, index } : null;
        })
        .filter((item): item is { card: Card; index: number } => item !== null);

      if (expandedId && selectedIds.has(expandedId)) onExpandedChange(null);
      if (askCardId && selectedIds.has(askCardId)) onAskReset();
      void Promise.all(ids.map((id) => deleteAskHistory(id)));
      // Soft-delete: sets deletedAt tombstone on all selected cards
      await deleteCards(ids);

      const payload: PendingDelete = { type: "batch", items };
      pendingDeleteRef.current = payload;
      setPendingDelete(payload);
      onSelectionCleared();
      scheduleToastDismiss();
    },
    [scheduleToastDismiss],
  );

  const handleUndoDelete = useCallback(async () => {
    clearDeleteTimer();
    const pending = pendingDeleteRef.current;
    pendingDeleteRef.current = null;
    setPendingDelete(null);
    if (!pending) return;
    // Undo: restoreCard clears the deletedAt tombstone
    if (pending.type === "batch") {
      const sorted = [...pending.items].sort((a, b) => a.index - b.index);
      for (const item of sorted) {
        await restoreCard(item.card, item.index);
      }
    } else {
      await restoreCard(pending.card, pending.index);
    }
  }, [clearDeleteTimer]);

  return {
    pendingDelete,
    clearDeleteTimer,
    scheduleToastDismiss,
    handleDelete,
    handleBatchDelete,
    handleUndoDelete,
  };
}
