import { RefObject, useState, useEffect, useRef } from "react";
import { ArrowLeft, Search, Settings, X, Brain, MoreHorizontal, Download, CheckSquare } from "lucide-react";

interface SearchHeaderProps {
  cardsCount: number;
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
  backLabel: string;
  cardCountLabel: string;
  searchPlaceholder: string;
  exportMarkdownLabel: string;
  exportJSONLabel: string;
  selectLabel: string;
  settingsLabel: string;
  analyzeMindsetLabel: string;
  moreLabel: string;
}

export function SearchHeader({
  cardsCount,
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
  backLabel,
  cardCountLabel,
  searchPlaceholder,
  exportMarkdownLabel,
  exportJSONLabel,
  selectLabel,
  settingsLabel,
  analyzeMindsetLabel,
  moreLabel,
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
    <header className="sticky top-0 bg-paper/90 backdrop-blur-sm border-b border-line-soft z-10">
      <div className="max-w-[680px] mx-auto px-6 py-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={onBack}
            className="text-ink-400 hover:text-ink-600 transition-colors shrink-0"
            title={backLabel}
          >
            <ArrowLeft size={18} />
          </button>
          <h1 className="font-quote text-[20px] font-semibold tracking-tight text-ink-900">
            {title}
          </h1>
          <span className="font-quote text-[13px] text-ink-300 tabular-nums shrink-0">
            {cardCountLabel}
          </span>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative hidden sm:block">
            <Search
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-300"
            />
            <input
              ref={searchRef}
              type="text"
              value={query}
              onChange={(e) => onQueryChange(e.target.value)}
              placeholder={searchPlaceholder}
              className="pl-8 pr-8 py-1.5 text-sm w-48 md:w-56 text-ink-900 border border-line rounded-lg bg-surface outline-none transition-shadow placeholder:text-ink-300 focus:border-seal/50 focus:ring-2 focus:ring-seal/20"
            />
            {query ? (
              <button
                onClick={onClearQuery}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-ink-300 hover:text-ink-600 transition-colors"
              >
                <X size={14} />
              </button>
            ) : (
              <kbd className="absolute right-2.5 top-1/2 -translate-y-1/2 px-1.5 py-0.5 text-[10px] leading-none text-ink-300 border border-line rounded bg-paper pointer-events-none">
                /
              </kbd>
            )}
          </div>

          <div className="flex items-center gap-0.5 p-0.5 border border-line rounded-xl bg-surface/60">
            {canAnalyzeMindset && (
              <button
                onClick={onAnalyzeMindset}
                className="p-1.5 text-ink-500 hover:text-seal hover:bg-surface rounded-lg transition-colors"
                title={analyzeMindsetLabel}
              >
                <Brain size={16} />
              </button>
            )}

            {hasMoreActions && (
              <div className="relative" ref={moreRef}>
                <button
                  onClick={() => setShowMore((v) => !v)}
                  className={`p-1.5 rounded-lg transition-colors ${
                    showMore
                      ? "text-ink-700 bg-line-soft"
                      : "text-ink-500 hover:text-ink-700 hover:bg-surface"
                  }`}
                  title={moreLabel}
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
              className="p-1.5 text-ink-500 hover:text-ink-700 hover:bg-surface rounded-lg transition-colors"
              title={settingsLabel}
            >
              <Settings size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* Mobile search bar */}
      <div className="sm:hidden px-6 pb-3">
        <div className="relative">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-300"
          />
          <input
            ref={searchRef}
            type="text"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder={searchPlaceholder}
            className="w-full pl-8 pr-8 py-1.5 text-sm text-ink-900 border border-line rounded-lg bg-surface outline-none transition-shadow placeholder:text-ink-300 focus:border-seal/50 focus:ring-2 focus:ring-seal/20"
          />
          {query ? (
            <button
              onClick={onClearQuery}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-ink-300 hover:text-ink-600 transition-colors"
            >
              <X size={14} />
            </button>
          ) : (
            <kbd className="absolute right-2.5 top-1/2 -translate-y-1/2 px-1.5 py-0.5 text-[10px] leading-none text-ink-300 border border-line rounded bg-paper pointer-events-none">
              /
            </kbd>
          )}
        </div>
      </div>
    </header>
  );
}
