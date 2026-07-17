import type { Card } from "@/lib/types";

export type PendingDelete =
  | { type: "single"; card: Card; index: number }
  | { type: "batch"; items: { card: Card; index: number }[] };

interface UndoToastProps {
  pendingDelete: PendingDelete;
  deletedToast: string;
  batchDeletedToast: string;
  undoLabel: string;
  onUndo: () => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}

export function UndoToast({
  pendingDelete,
  deletedToast,
  batchDeletedToast,
  undoLabel,
  onUndo,
  onMouseEnter,
  onMouseLeave,
}: UndoToastProps) {
  return (
    <div
      className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-4 bg-ink-900 text-paper rounded-full pl-5 pr-4 py-2.5 shadow-xl animate-[toast-up_.25s_ease-out]"
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <span className="text-xs">
        {pendingDelete.type === "batch"
          ? batchDeletedToast.replace("{{count}}", String(pendingDelete.items.length))
          : deletedToast}
      </span>
      <button
        onClick={onUndo}
        className="text-xs font-medium underline decoration-seal decoration-2 underline-offset-[3px] hover:opacity-75 transition-opacity"
      >
        {undoLabel}
      </button>
    </div>
  );
}
