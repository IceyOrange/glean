import { useState, useCallback } from "react";

/**
 * Manages multi-card selection state: which cards are selected and whether
 * selection mode is active.
 */
export function useSelection() {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectionMode, setSelectionMode] = useState(false);

  const toggleSelection = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => {
    setSelectionMode(false);
    setSelectedIds(new Set());
  }, []);

  return {
    selectedIds,
    setSelectedIds,
    selectionMode,
    setSelectionMode,
    toggleSelection,
    clearSelection,
  };
}
