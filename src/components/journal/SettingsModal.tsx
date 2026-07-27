import { useEffect, useRef } from "react";
import { Lang, t } from "@/lib/i18n";
import { SettingsPanel } from "@/components/SettingsPanel";

interface SettingsModalProps {
  lang: Lang;
  onSetLang: (lang: Lang) => void;
  onSaved: () => void;
  onClose: () => void;
  settingsTitle: string;
  settingsDesc: string;
  cancelLabel: string;
}

const TITLE_ID = "settings-modal-title";

export function SettingsModal({
  lang,
  onSetLang,
  onSaved,
  onClose,
  settingsTitle,
  settingsDesc,
  cancelLabel,
}: SettingsModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const prevFocusRef = useRef<HTMLElement | null>(null);

  const tr = (key: string, vars?: Record<string, string | number>) => t(key, lang, vars);

  // Focus trap + Escape close.
  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;

    // Record the previously focused element so we can restore it on close.
    prevFocusRef.current = document.activeElement as HTMLElement;

    // Focus the first focusable element inside the modal.
    const focusable = panel.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])',
    );
    if (focusable.length > 0) {
      requestAnimationFrame(() => focusable[0].focus());
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
        return;
      }

      if (e.key !== "Tab") return;

      const focusableEls = panel.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])',
      );
      if (focusableEls.length === 0) return;

      const first = focusableEls[0];
      const last = focusableEls[focusableEls.length - 1];

      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      // Restore focus when the modal closes.
      prevFocusRef.current?.focus();
      prevFocusRef.current = null;
    };
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={TITLE_ID}
      className="fixed inset-0 bg-ink-900/30 flex items-center justify-center z-50 p-4 animate-modal-backdrop"
      onClick={onClose}
    >
      <div
        ref={panelRef}
        className="bg-surface rounded-2xl border border-line-soft shadow-xl p-6 w-[420px] max-w-full max-h-[85vh] overflow-y-auto animate-modal-panel"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id={TITLE_ID} className="font-quote text-[16px] font-semibold text-ink-900 mb-1">{settingsTitle}</h3>
        <p className="text-xs text-ink-500 leading-relaxed mb-5">
          {settingsDesc}
        </p>

        <SettingsPanel lang={lang} tr={tr} onSetLang={onSetLang} onSaved={onSaved} />

        <div className="flex justify-end mt-6 pt-4 border-t border-line-soft">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-xs text-ink-600 hover:bg-line-soft rounded-lg transition-colors"
          >
            {cancelLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
