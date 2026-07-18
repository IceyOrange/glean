import { RefObject } from "react";
import { ArrowLeft, Search, Download, Settings, X, Brain } from "lucide-react";

interface SearchHeaderProps {
  cardsCount: number;
  query: string;
  showExport: boolean;
  canExport: boolean;
  canSelect: boolean;
  canAnalyzeMindset: boolean;
  exportRef: RefObject<HTMLDivElement | null>;
  searchRef: RefObject<HTMLInputElement | null>;
  onBack: () => void;
  onQueryChange: (value: string) => void;
  onClearQuery: () => void;
  onToggleExport: () => void;
  onExport: (format: "md" | "json") => void;
  onStartSelection: () => void;
  onAnalyzeMindset: () => void;
  onOpenSettings: () => void;
  title: string;
  backLabel: string;
  cardCountLabel: string;
  searchPlaceholder: string;
  exportDataLabel: string;
  exportMarkdownLabel: string;
  exportJSONLabel: string;
  selectLabel: string;
  settingsLabel: string;
  analyzeMindsetLabel: string;
}

export function SearchHeader({
  cardsCount,
  query,
  showExport,
  canExport,
  canSelect,
  canAnalyzeMindset,
  exportRef,
  searchRef,
  onBack,
  onQueryChange,
  onClearQuery,
  onToggleExport,
  onExport,
  onStartSelection,
  onAnalyzeMindset,
  onOpenSettings,
  title,
  backLabel,
  cardCountLabel,
  searchPlaceholder,
  exportDataLabel,
  exportMarkdownLabel,
  exportJSONLabel,
  selectLabel,
  settingsLabel,
  analyzeMindsetLabel,
}: SearchHeaderProps) {
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
        <div className="flex items-center gap-2">
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
              className="pl-8 pr-8 py-1.5 text-sm w-56 text-ink-900 border border-line rounded-lg bg-surface outline-none transition-shadow placeholder:text-ink-300 focus:border-seal/50 focus:ring-2 focus:ring-seal/20"
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
          {canExport && (
            <div className="relative" ref={exportRef}>
              <button
                onClick={onToggleExport}
                className="p-1.5 text-ink-400 hover:text-ink-600 hover:bg-surface rounded-lg transition-colors"
                title={exportDataLabel}
              >
                <Download size={16} />
              </button>
              {showExport && (
                <div className="absolute right-0 top-full mt-1 w-44 bg-surface border border-line-soft rounded-xl shadow-lg py-1 z-20">
                  <button
                    onClick={() => onExport("md")}
                    className="w-full text-left px-3 py-2 text-xs text-ink-600 hover:bg-line-soft transition-colors"
                  >
                    {exportMarkdownLabel}
                  </button>
                  <button
                    onClick={() => onExport("json")}
                    className="w-full text-left px-3 py-2 text-xs text-ink-600 hover:bg-line-soft transition-colors"
                  >
                    {exportJSONLabel}
                  </button>
                </div>
              )}
            </div>
          )}
          {canSelect && (
            <button
              onClick={onStartSelection}
              className="px-2 py-1 text-xs text-ink-500 hover:text-ink-700 hover:bg-surface rounded-lg transition-colors"
              title={selectLabel}
            >
              {selectLabel}
            </button>
          )}
          {canAnalyzeMindset && (
            <button
              onClick={onAnalyzeMindset}
              className="p-1.5 text-ink-400 hover:text-seal hover:bg-surface rounded-lg transition-colors"
              title={analyzeMindsetLabel}
            >
              <Brain size={16} />
            </button>
          )}
          <button
            onClick={onOpenSettings}
            className="p-1.5 text-ink-400 hover:text-ink-600 hover:bg-surface rounded-lg transition-colors"
            title={settingsLabel}
          >
            <Settings size={16} />
          </button>
        </div>
      </div>
    </header>
  );
}
