import { ReactNode, RefObject, useState, useEffect, useRef } from "react";
import { ArrowLeft, Search, Settings, X, Brain, MoreHorizontal, Download, CheckSquare, Diamond, Upload, Trash2, RefreshCw } from "lucide-react";

interface SearchHeaderProps {
  query: string;
  canSelect: boolean;
  canExport: boolean;
  canAnalyzeMindset: boolean;
  /** Whether AI is configured; controls the mindset button's visual state. */
  aiReady: boolean;
  searchRef: RefObject<HTMLInputElement | null>;
  onBack: () => void;
  onQueryChange: (value: string) => void;
  onClearQuery: () => void;
  onExport: (format: "md" | "json") => void;
  onStartSelection: () => void;
  onAnalyzeMindset: () => void;
  onOpenSettings: () => void;
  onImport: () => void;
  onOpenTrash: () => void;
  showSync: boolean;
  syncing: boolean;
  onSync: () => void;
  activeFilter: "all" | "noThought" | "recent";
  onFilterChange: (filter: "all" | "noThought" | "recent") => void;
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
  /** Tooltip shown when AI is not configured. */
  aiNotConfiguredHint: string;
  moreLabel: string;
  clearSearchLabel: string;
  importLabel: string;
  trashLabel: string;
  syncLabel: string;
  filterLabel: string;
  filterOptions: Record<"all" | "noThought" | "recent", string>;
  /** Number of matching cards while searching. */
  resultCount?: number;
  /** Localized label for the result count (e.g. "3 results"). */
  resultCountLabel?: string;
  /** Rendered inside the sticky bar (e.g. the selection toolbar). */
  children?: ReactNode;
}

export function SearchHeader({
  query,
  canSelect,
  canExport,
  canAnalyzeMindset,
  aiReady,
  searchRef,
  onBack,
  onQueryChange,
  onClearQuery,
  onExport,
  onStartSelection,
  onAnalyzeMindset,
  onOpenSettings,
  onImport,
  onOpenTrash,
  showSync,
  syncing,
  onSync,
  activeFilter,
  onFilterChange,
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
  aiNotConfiguredHint,
  moreLabel,
  clearSearchLabel,
  importLabel,
  trashLabel,
  syncLabel,
  filterLabel,
  filterOptions,
  resultCount,
  resultCountLabel,
  children,
}: SearchHeaderProps) {
  const [showMore, setShowMore] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);
  const hasMoreActions = true;

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
      <header className="max-w-[720px] mx-auto px-6 pt-8 pb-5 text-center">
        <p className="font-quote italic text-[28px] font-semibold tracking-tight text-ink-900 leading-none">
          {title}
        </p>
        <p className="mt-1.5 text-[10px] uppercase tracking-[0.25em] text-ink-500">
          {subtitle}
        </p>
        <div className="mt-3 flex items-center justify-center gap-3" aria-hidden="true">
          <span className="h-px w-8 bg-line" />
          <Diamond size={6} className="text-seal/60" fill="currentColor" />
          <span className="h-px w-8 bg-line" />
        </div>
        {statsLabel && (
          <p className="mt-3 text-[11px] text-ink-400 tabular-nums">{statsLabel}</p>
        )}
      </header>

      {/* Sticky toolbar */}
      <div className="sticky top-0 z-10 border-b border-line-soft bg-paper/90 backdrop-blur-sm">
        <div className="max-w-[720px] mx-auto px-3 sm:px-6 h-14 flex items-center gap-1.5 sm:gap-3">
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
              aria-label={searchPlaceholder}
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

          {query && resultCountLabel && (
            <span
              className="hidden sm:block text-[11px] text-ink-400 tabular-nums whitespace-nowrap"
              aria-live="polite"
            >
              {resultCountLabel}
            </span>
          )}

          <div className="flex items-center gap-0.5 shrink-0 ml-auto">
            {showSync && (
              <button
                onClick={onSync}
                disabled={syncing}
                className="relative min-w-9 min-h-9 inline-flex items-center justify-center rounded-lg text-ink-400 transition-colors hover:text-seal disabled:cursor-wait disabled:opacity-60"
                title={syncLabel}
                aria-label={syncLabel}
              >
                <RefreshCw size={16} className={syncing ? "animate-spin" : ""} />
              </button>
            )}
            {canAnalyzeMindset && (
              <button
                onClick={onAnalyzeMindset}
                className={`relative p-2 rounded-lg transition-colors ${
                  aiReady
                    ? "text-ink-400 hover:text-seal"
                    : "text-ink-300 hover:text-ink-500"
                }`}
                title={aiReady ? analyzeMindsetLabel : aiNotConfiguredHint}
                aria-label={aiReady ? analyzeMindsetLabel : aiNotConfiguredHint}
              >
                <Brain size={16} />
                {!aiReady && (
                  <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-seal/70" />
                )}
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
                  aria-expanded={showMore}
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
                    <p className="px-3 pt-2 pb-1 text-[10px] font-medium uppercase tracking-wide text-ink-400">{filterLabel}</p>
                    {(Object.keys(filterOptions) as Array<keyof typeof filterOptions>).map((filter) => (
                      <button
                        key={filter}
                        onClick={() => {
                          setShowMore(false);
                          onFilterChange(filter);
                        }}
                        className={`w-full px-3 py-2 text-left text-xs transition-colors ${activeFilter === filter ? "bg-seal/10 text-seal" : "text-ink-600 hover:bg-line-soft"}`}
                      >
                        {filterOptions[filter]}
                      </button>
                    ))}
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
                    <button
                      onClick={() => {
                        setShowMore(false);
                        onImport();
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-xs text-ink-600 hover:bg-line-soft transition-colors"
                    >
                      <Upload size={13} />
                      {importLabel}
                    </button>
                    <button
                      onClick={() => {
                        setShowMore(false);
                        onOpenTrash();
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-xs text-ink-600 hover:bg-line-soft transition-colors"
                    >
                      <Trash2 size={13} />
                      {trashLabel}
                    </button>
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
