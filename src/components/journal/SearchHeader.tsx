import { ReactNode, RefObject, useState, useEffect, useRef } from "react";
import { ArrowLeft, Search, Settings, X, Brain, MoreHorizontal, Download, CheckSquare, Diamond } from "lucide-react";

interface SearchHeaderProps {
  query: string;
  canSelect: boolean;
  canExport: boolean;
  canAnalyzeMindset: boolean;
  searchRef: RefObject<HTMLInputElement | null>;
  onBack: () => void;
  onQueryChange: (value: string) => void;
  onClearQuery: () => void;
  onExport: (format: "md" | "json") => void;
  onStartSelection: () => void;
  onAnalyzeMindset: () => void;
  onOpenSettings: () => void;
  title: string;
  subtitle: string;
  /** One-line collection summary under the masthead; hidden when empty. */
  statsLabel: string;
  backLabel: string;
  searchPlaceholder: string;
  exportMarkdownLabel: string;
  exportJSONLabel: string;
  selectLabel: string;
  settingsLabel: string;
  analyzeMindsetLabel: string;
  moreLabel: string;
  clearSearchLabel: string;
  /** Rendered inside the sticky bar (e.g. the selection toolbar). */
  children?: ReactNode;
}

export function SearchHeader({
  query,
  canSelect,
  canExport,
  canAnalyzeMindset,
  searchRef,
  onBack,
  onQueryChange,
  onClearQuery,
  onExport,
  onStartSelection,
  onAnalyzeMindset,
  onOpenSettings,
  title,
  subtitle,
  statsLabel,
  backLabel,
  searchPlaceholder,
  exportMarkdownLabel,
  exportJSONLabel,
  selectLabel,
  settingsLabel,
  analyzeMindsetLabel,
  moreLabel,
  clearSearchLabel,
  children,
}: SearchHeaderProps) {
  const [showMore, setShowMore] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);
  const hasMoreActions = canSelect || canExport;

  // Close the more menu on outside click.
  useEffect(() => {
    if (!showMore) return;
    const onDown = (e: MouseEvent) => {
      if (!moreRef.current?.contains(e.target as Node)) setShowMore(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [showMore]);

  return (
    // Fragment, not a wrapper element: the sticky toolbar must be a direct
    // child of the page root so it can stick beyond the masthead's height.
    <>
      {/* Masthead — the journal cover, scrolls away */}
      <header className="max-w-[768px] mx-auto px-6 pt-12 pb-8 text-center">
        <p className="font-quote italic text-[34px] font-semibold tracking-tight text-ink-900 leading-none">
          {title}
        </p>
        <p className="mt-2.5 text-[11px] uppercase tracking-[0.35em] text-ink-500">
          {subtitle}
        </p>
        <div className="mt-6 flex items-center justify-center gap-3" aria-hidden="true">
          <span className="h-px w-12 bg-line" />
          <Diamond size={7} className="text-seal/70" fill="currentColor" />
          <span className="h-px w-12 bg-line" />
        </div>
        {statsLabel && (
          <p className="mt-6 text-[12px] text-ink-500 tabular-nums">{statsLabel}</p>
        )}
      </header>

      {/* Sticky toolbar */}
      <div className="sticky top-0 z-10 border-b border-line-soft bg-paper/90 backdrop-blur-sm">
        <div className="max-w-[768px] mx-auto px-3 sm:px-6 h-14 flex items-center gap-1.5 sm:gap-3">
          <button
            onClick={onBack}
            className="p-2 text-ink-400 hover:text-ink-700 transition-colors shrink-0"
            title={backLabel}
            aria-label={backLabel}
          >
            <ArrowLeft size={17} />
          </button>

          <div className="relative flex-1 min-w-0 max-w-[460px]">
            <Search
              size={14}
              className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-300 pointer-events-none"
            />
            <input
              ref={searchRef}
              type="text"
              value={query}
              onChange={(e) => onQueryChange(e.target.value)}
              placeholder={searchPlaceholder}
              className="w-full pl-9 pr-8 py-1.5 text-[13px] text-ink-900 border border-line rounded-full bg-surface outline-none transition-shadow placeholder:text-ink-300 focus:border-seal/50 focus:ring-2 focus:ring-seal/20"
            />
            {query ? (
              <button
                onClick={onClearQuery}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 text-ink-300 hover:text-ink-600 transition-colors"
                aria-label={clearSearchLabel}
              >
                <X size={14} />
              </button>
            ) : (
              <kbd className="absolute right-3.5 top-1/2 -translate-y-1/2 px-1.5 py-0.5 text-[10px] leading-none text-ink-300 border border-line rounded bg-paper pointer-events-none">
                /
              </kbd>
            )}
          </div>

          <div className="flex items-center gap-0.5 shrink-0 ml-auto">
            {canAnalyzeMindset && (
              <button
                onClick={onAnalyzeMindset}
                className="p-2 text-ink-400 hover:text-seal rounded-lg transition-colors"
                title={analyzeMindsetLabel}
                aria-label={analyzeMindsetLabel}
              >
                <Brain size={16} />
              </button>
            )}

            {hasMoreActions && (
              <div className="relative" ref={moreRef}>
                <button
                  onClick={() => setShowMore((v) => !v)}
                  className={`p-2 rounded-lg transition-colors ${
                    showMore
                      ? "text-ink-700 bg-line-soft"
                      : "text-ink-400 hover:text-ink-700"
                  }`}
                  title={moreLabel}
                  aria-label={moreLabel}
                >
                  <MoreHorizontal size={16} />
                </button>

                {showMore && (
                  <div className="absolute right-0 top-full mt-1.5 w-48 bg-surface border border-line-soft rounded-xl shadow-lg py-1 z-20">
                    {canSelect && (
                      <button
                        onClick={() => {
                          setShowMore(false);
                          onStartSelection();
                        }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-xs text-ink-600 hover:bg-line-soft transition-colors"
                      >
                        <CheckSquare size={13} />
                        {selectLabel}
                      </button>
                    )}
                    {canExport && (
                      <>
                        <button
                          onClick={() => {
                            setShowMore(false);
                            onExport("md");
                          }}
                          className="w-full flex items-center gap-2 px-3 py-2 text-xs text-ink-600 hover:bg-line-soft transition-colors"
                        >
                          <Download size={13} />
                          {exportMarkdownLabel}
                        </button>
                        <button
                          onClick={() => {
                            setShowMore(false);
                            onExport("json");
                          }}
                          className="w-full flex items-center gap-2 px-3 py-2 text-xs text-ink-600 hover:bg-line-soft transition-colors"
                        >
                          <Download size={13} />
                          {exportJSONLabel}
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
            )}

            <button
              onClick={onOpenSettings}
              className="p-2 text-ink-400 hover:text-ink-700 rounded-lg transition-colors"
              title={settingsLabel}
              aria-label={settingsLabel}
            >
              <Settings size={16} />
            </button>
          </div>
        </div>

        {children}
      </div>
    </>
  );
}
