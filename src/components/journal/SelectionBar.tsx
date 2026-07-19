interface SelectionBarProps {
  filteredCount: number;
  selectedCount: number;
  allFilteredSelected: boolean;
  onToggleSelectAll: () => void;
  onBatchExport: (format: "md" | "json") => void;
  onBatchDelete: () => void;
  onCancel: () => void;
  selectAllLabel: string;
  deselectAllLabel: string;
  selectedCountLabel: string;
  exportMarkdownLabel: string;
  exportJSONLabel: string;
  batchDeleteLabel: string;
  cancelLabel: string;
}

export function SelectionBar({
  filteredCount,
  selectedCount,
  allFilteredSelected,
  onToggleSelectAll,
  onBatchExport,
  onBatchDelete,
  onCancel,
  selectAllLabel,
  deselectAllLabel,
  selectedCountLabel,
  exportMarkdownLabel,
  exportJSONLabel,
  batchDeleteLabel,
  cancelLabel,
}: SelectionBarProps) {
  return (
    <div className="sticky top-[65px] bg-paper/95 backdrop-blur-sm border-b border-line-soft z-10">
      <div className="max-w-[680px] mx-auto px-6 py-2.5 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            onClick={onToggleSelectAll}
            className="text-xs text-ink-500 hover:text-ink-700 transition-colors"
          >
            {filteredCount > 0 && allFilteredSelected ? deselectAllLabel : selectAllLabel}
          </button>
          <span className="text-xs text-ink-500">
            {selectedCountLabel}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => onBatchExport("md")}
            disabled={selectedCount === 0}
            className="px-2.5 py-1.5 text-xs text-ink-600 hover:bg-line-soft disabled:opacity-40 disabled:hover:bg-transparent rounded-lg transition-colors"
          >
            {exportMarkdownLabel}
          </button>
          <button
            onClick={() => onBatchExport("json")}
            disabled={selectedCount === 0}
            className="px-2.5 py-1.5 text-xs text-ink-600 hover:bg-line-soft disabled:opacity-40 disabled:hover:bg-transparent rounded-lg transition-colors"
          >
            {exportJSONLabel}
          </button>
          <button
            onClick={onBatchDelete}
            disabled={selectedCount === 0}
            className="px-2.5 py-1.5 text-xs text-seal hover:bg-seal/10 disabled:opacity-40 disabled:hover:bg-transparent rounded-lg transition-colors"
          >
            {batchDeleteLabel}
          </button>
          <button
            onClick={onCancel}
            className="px-2.5 py-1.5 text-xs text-ink-500 hover:text-ink-700 hover:bg-line-soft rounded-lg transition-colors"
          >
            {cancelLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
