import { useEffect, useRef, useState } from "react";
import type { MindsetAnalysis } from "@/lib/ai";
import { X, RefreshCw, Brain, Target, Compass, GitBranch, Link2, Bookmark } from "lucide-react";

interface MindsetModalProps {
  open: boolean;
  loading: boolean;
  error: string | null;
  analysis: MindsetAnalysis | null;
  title: string;
  themesLabel: string;
  patternsLabel: string;
  evolutionLabel: string;
  connectionsLabel: string;
  loadingLabel: string;
  retryLabel: string;
  regenerateLabel: string;
  closeLabel: string;
  emptyLabel: string;
  genFail: string;
  saveLabel: string;
  savedLabel: string;
  onAnalyze: () => void;
  onClose: () => void;
  /** Called with formatted analysis text when the user clicks "Save to inspiration library". */
  onSaveAnalysis: (text: string) => void;
}

const TITLE_ID = "mindset-modal-title";

export function MindsetModal({
  open,
  loading,
  error,
  analysis,
  title,
  themesLabel,
  patternsLabel,
  evolutionLabel,
  connectionsLabel,
  loadingLabel,
  retryLabel,
  regenerateLabel,
  closeLabel,
  emptyLabel,
  genFail,
  saveLabel,
  savedLabel,
  onAnalyze,
  onClose,
  onSaveAnalysis,
}: MindsetModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const prevFocusRef = useRef<HTMLElement | null>(null);
  const [saved, setSaved] = useState(false);

  // Trigger analysis automatically when the modal opens and there is no result yet.
  useEffect(() => {
    if (open && !analysis && !loading && !error) {
      onAnalyze();
    }
  }, [open, analysis, loading, error, onAnalyze]);

  // Focus trap + Escape close.
  useEffect(() => {
    if (!open) return;

    // Record the previously focused element so we can restore it on close.
    prevFocusRef.current = document.activeElement as HTMLElement;

    // Focus the first focusable element inside the modal.
    const panel = panelRef.current;
    if (panel) {
      const focusable = panel.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length > 0) {
        requestAnimationFrame(() => focusable[0].focus());
      }
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
        return;
      }

      if (e.key !== "Tab" || !panel) return;

      const focusable = panel.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

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
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      ref={overlayRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={TITLE_ID}
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/30 p-4 animate-modal-backdrop"
      onClick={onClose}
    >
      <div
        ref={panelRef}
        className="relative w-full max-w-2xl max-h-[85vh] overflow-y-auto bg-paper border border-line-soft rounded-2xl shadow-2xl animate-modal-panel"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-paper/95 backdrop-blur-sm border-b border-line-soft px-5 py-4 flex items-center justify-between gap-3 z-10">
          <div className="flex items-center gap-2 text-ink-900">
            <Brain size={18} className="text-seal" />
            <h2 id={TITLE_ID} className="text-[15px] font-semibold tracking-tight">{title}</h2>
          </div>
          <div className="flex items-center gap-1">
            {analysis && !loading && (
              <button
                onClick={onAnalyze}
                className="p-1.5 text-ink-400 hover:text-seal transition-colors rounded-lg hover:bg-surface"
                title={regenerateLabel}
                aria-label={regenerateLabel}
              >
                <RefreshCw size={15} />
              </button>
            )}
            <button
              onClick={onClose}
              className="p-1.5 text-ink-400 hover:text-ink-600 transition-colors rounded-lg hover:bg-surface"
              title={closeLabel}
              aria-label={closeLabel}
            >
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="px-5 py-5">
          {loading && (
            <div className="flex flex-col items-center justify-center gap-3 py-12 text-ink-400">
              <RefreshCw size={22} className="animate-spin" />
              <p className="text-[13px]">{loadingLabel}</p>
            </div>
          )}

          {error && !loading && (
            <div className="text-center py-10">
              <p className="text-[13px] text-seal mb-3">
                {error || genFail}
              </p>
              <button
                onClick={onAnalyze}
                className="px-4 py-1.5 text-[13px] font-medium text-paper bg-ink-900 rounded-lg hover:bg-ink-800 transition-colors"
              >
                {retryLabel}
              </button>
            </div>
          )}

          {analysis && !loading && (
            <div className="space-y-6">
              <Section
                icon={<Target size={13} className="text-ochre" />}
                label={themesLabel}
              >
                <ul className="flex flex-wrap gap-2">
                  {analysis.themes.map((t, i) => (
                    <li
                      key={i}
                      className="px-2.5 py-1 text-[12px] text-ink-700 bg-surface border border-line-soft rounded-full"
                    >
                      {t}
                    </li>
                  ))}
                </ul>
              </Section>

              <Section
                icon={<Compass size={13} className="text-sage" />}
                label={patternsLabel}
              >
                <ul className="space-y-1.5">
                  {analysis.patterns.map((p, i) => (
                    <li
                      key={i}
                      className="text-[13px] text-ink-600 leading-relaxed pl-1"
                    >
                      · {p}
                    </li>
                  ))}
                </ul>
              </Section>

              <Section
                icon={<GitBranch size={13} className="text-seal" />}
                label={evolutionLabel}
              >
                <p className="text-[13px] text-ink-600 leading-relaxed whitespace-pre-wrap">
                  {analysis.evolution}
                </p>
              </Section>

              <Section
                icon={<Link2 size={13} className="text-ink-500" />}
                label={connectionsLabel}
              >
                <ul className="space-y-1.5">
                  {analysis.connections.map((c, i) => (
                    <li
                      key={i}
                      className="text-[13px] text-ink-600 leading-relaxed pl-1"
                    >
                      · {c}
                    </li>
                  ))}
                </ul>
              </Section>

              {/* Save to inspiration library */}
              <div className="pt-2 border-t border-line-soft">
                <button
                  disabled={saved}
                  onClick={() => {
                    const text = formatAnalysis(analysis, {
                      themesLabel,
                      patternsLabel,
                      evolutionLabel,
                      connectionsLabel,
                    });
                    onSaveAnalysis(text);
                    setSaved(true);
                    setTimeout(() => setSaved(false), 2000);
                  }}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium rounded-lg transition-colors ${
                    saved
                      ? "text-sage bg-sage/10 cursor-default"
                      : "text-ink-500 hover:text-seal hover:bg-surface"
                  }`}
                >
                  <Bookmark size={13} className={saved ? "fill-sage" : ""} />
                  {saved ? savedLabel : saveLabel}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Section({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-2">
        {icon}
        <span className="text-[10px] font-medium uppercase tracking-[0.1em] text-ink-500">
          {label}
        </span>
      </div>
      <div className="pl-5">{children}</div>
    </div>
  );
}

/** Format a MindsetAnalysis into a plain-text string suitable for saving as a card. */
function formatAnalysis(
  analysis: MindsetAnalysis,
  labels: {
    themesLabel: string;
    patternsLabel: string;
    evolutionLabel: string;
    connectionsLabel: string;
  },
): string {
  const lines: string[] = [];
  lines.push(`${labels.themesLabel}：${analysis.themes.join("、")}`);
  lines.push("");
  lines.push(`${labels.patternsLabel}：${analysis.patterns.join("；")}`);
  lines.push("");
  lines.push(`${labels.evolutionLabel}：${analysis.evolution}`);
  lines.push("");
  lines.push(`${labels.connectionsLabel}：${analysis.connections.join("；")}`);
  return lines.join("\n");
}
