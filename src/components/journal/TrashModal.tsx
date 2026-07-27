import { useEffect, useRef } from "react";
import { RotateCcw, Trash2, X } from "lucide-react";
import type { Card } from "@/lib/types";

interface TrashModalProps {
  cards: Card[];
  onClose: () => void;
  onRestore: (id: string) => void;
  onDelete: (id: string) => void;
  title: string;
  emptyLabel: string;
  restoreLabel: string;
  deleteLabel: string;
  closeLabel: string;
}

export function TrashModal({
  cards, onClose, onRestore, onDelete, title, emptyLabel, restoreLabel, deleteLabel, closeLabel,
}: TrashModalProps) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="trash-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/30 p-4 animate-modal-backdrop"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md max-h-[80vh] overflow-y-auto rounded-2xl border border-line-soft bg-surface p-5 shadow-xl animate-modal-panel"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 id="trash-title" className="font-quote text-lg font-semibold text-ink-900">{title}</h2>
          <button ref={closeRef} onClick={onClose} className="min-w-9 min-h-9 inline-flex items-center justify-center rounded-lg text-ink-400 hover:bg-line-soft hover:text-ink-700" aria-label={closeLabel}>
            <X size={16} />
          </button>
        </div>
        {cards.length === 0 ? (
          <p className="py-8 text-center text-sm text-ink-500">{emptyLabel}</p>
        ) : (
          <ul className="space-y-2">
            {cards.map((card) => (
              <li key={card.id} className="rounded-xl border border-line-soft bg-paper p-3">
                <p className="line-clamp-2 font-quote text-sm leading-relaxed text-ink-800">{card.content}</p>
                <div className="mt-3 flex justify-end gap-1.5">
                  <button onClick={() => onRestore(card.id)} className="min-h-9 inline-flex items-center gap-1 rounded-lg px-2.5 text-xs text-ink-700 hover:bg-line-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-seal/40">
                    <RotateCcw size={13} /> {restoreLabel}
                  </button>
                  <button onClick={() => onDelete(card.id)} className="min-h-9 inline-flex items-center gap-1 rounded-lg px-2.5 text-xs text-seal hover:bg-seal/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-seal/40">
                    <Trash2 size={13} /> {deleteLabel}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
