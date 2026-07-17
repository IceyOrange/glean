import { RefreshCw, Lightbulb, Link2, Compass, Brain } from "lucide-react";
import { Insight } from "@/lib/ai";

interface InsightPanelProps {
  insight: Insight | null;
  loading: boolean;
  error: string | null;
  reflectLabel: string;
  connectLabel: string;
  patternLabel: string;
  suggestLabel: string;
  loadingLabel: string;
  retryLabel: string;
  refreshLabel: string;
  collapseLabel: string;
  genFail: string;
  onRefresh: () => void;
  onCollapse: () => void;
}

export function InsightPanel({
  insight,
  loading,
  error,
  reflectLabel,
  connectLabel,
  patternLabel,
  suggestLabel,
  loadingLabel,
  retryLabel,
  refreshLabel,
  collapseLabel,
  genFail,
  onRefresh,
  onCollapse,
}: InsightPanelProps) {
  return (
    <div className="mt-4 bg-surface border border-line-soft rounded-xl px-4 py-3.5">
      <div className="flex items-center justify-between">
        {loading ? (
          <div className="flex items-center gap-2 text-xs text-ink-400 py-3">
            <RefreshCw size={13} className="animate-spin" />
            <span>{loadingLabel}</span>
          </div>
        ) : (
          <span />
        )}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRefresh();
          }}
          disabled={loading}
          className="p-1 text-ink-300 hover:text-seal transition-colors disabled:opacity-40"
          title={refreshLabel}
        >
          <RefreshCw size={12} />
        </button>
      </div>

      {error && (
        <div className="text-xs text-seal py-2">
          {error}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onRefresh();
            }}
            className="ml-2 underline underline-offset-2"
          >
            {retryLabel}
          </button>
        </div>
      )}

      {insight && (
        <div className="space-y-3.5">
          <div>
            <div className="flex items-center gap-1.5 mb-1.5">
              <Lightbulb size={12} className="text-ochre" />
              <span className="text-[10px] font-medium uppercase tracking-[0.1em] text-ink-400">{reflectLabel}</span>
            </div>
            <p className="text-[13px] text-ink-600 leading-relaxed pl-5">{insight.reflection}</p>
          </div>

          {insight.connections.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 mb-1.5">
                <Link2 size={12} className="text-sage" />
                <span className="text-[10px] font-medium uppercase tracking-[0.1em] text-ink-400">{connectLabel}</span>
              </div>
              <ul className="space-y-1 pl-5">
                {insight.connections.map((conn, i) => (
                  <li key={i} className="text-[13px] text-ink-600 leading-relaxed list-disc marker:text-ink-300">{conn}</li>
                ))}
              </ul>
            </div>
          )}

          <div>
            <div className="flex items-center gap-1.5 mb-1.5">
              <Compass size={12} className="text-seal" />
              <span className="text-[10px] font-medium uppercase tracking-[0.1em] text-ink-400">{patternLabel}</span>
            </div>
            <p className="text-[13px] text-ink-600 leading-relaxed pl-5">{insight.thinkingPattern}</p>
          </div>

          {insight.suggestions.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 mb-1.5">
                <Brain size={12} className="text-ink-600" />
                <span className="text-[10px] font-medium uppercase tracking-[0.1em] text-ink-400">{suggestLabel}</span>
              </div>
              <ul className="space-y-1 pl-5">
                {insight.suggestions.map((sug, i) => (
                  <li key={i} className="text-[13px] text-ink-600 leading-relaxed list-disc marker:text-ink-300">{sug}</li>
                ))}
              </ul>
            </div>
          )}

          <button
            onClick={(e) => {
              e.stopPropagation();
              onCollapse();
            }}
            className="text-[11px] text-ink-300 hover:text-ink-600 transition-colors"
          >
            {collapseLabel}
          </button>
        </div>
      )}

    </div>
  );
}
