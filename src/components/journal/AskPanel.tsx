import { useState, useRef, useEffect } from "react";
import type { AskExchange } from "@/lib/ai";
import { Send, MessageCircleQuestion, ChevronUp, RefreshCw } from "lucide-react";

interface AskPanelProps {
  exchanges: AskExchange[];
  loading: boolean;
  error: string | null;
  title: string;
  placeholder: string;
  submitLabel: string;
  collapseLabel: string;
  loadingLabel: string;
  retryLabel: string;
  emptyHint: string;
  errorHint: string;
  onAsk: (question: string) => void;
  onCollapse: () => void;
}

export function AskPanel({
  exchanges,
  loading,
  error,
  title,
  placeholder,
  submitLabel,
  collapseLabel,
  loadingLabel,
  retryLabel,
  emptyHint,
  errorHint,
  onAsk,
  onCollapse,
}: AskPanelProps) {
  const [question, setQuestion] = useState("");
  const [failedQuestion, setFailedQuestion] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus the input when the panel opens.
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Scroll to the latest exchange whenever the list grows.
  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [exchanges.length, loading]);

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    const trimmed = question.trim();
    if (!trimmed || loading) return;
    setQuestion("");
    setFailedQuestion(trimmed);
    onAsk(trimmed);
  };

  const handleRetry = () => {
    const q = failedQuestion;
    if (!q) return;
    onAsk(q);
  };

  return (
    <div
      className="mt-4 bg-surface border border-line-soft rounded-xl px-4 py-3.5"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-1.5 text-ink-600">
          <MessageCircleQuestion size={14} />
          <span className="text-[11px] font-medium uppercase tracking-[0.08em]">
            {title}
          </span>
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onCollapse();
          }}
          className="p-1 text-ink-300 hover:text-ink-600 transition-colors"
          title={collapseLabel}
        >
          <ChevronUp size={14} />
        </button>
      </div>

      <div
        ref={listRef}
        className="max-h-80 overflow-y-auto space-y-4 mb-3 pr-1"
      >
        {exchanges.length === 0 && !loading && !error && (
          <p className="text-[12px] text-ink-500 leading-relaxed py-2">
            {emptyHint}
          </p>
        )}

        {exchanges.map((ex, i) => (
          <div key={i} className="space-y-1.5">
            <div className="flex items-start gap-2">
              <span className="shrink-0 text-[10px] font-semibold text-seal mt-0.5">
                Q
              </span>
              <p className="text-[13px] text-ink-900 leading-relaxed">
                {ex.question}
              </p>
            </div>
            <div className="flex items-start gap-2">
              <span className="shrink-0 text-[10px] font-semibold text-ink-500 mt-0.5">
                A
              </span>
              <p className="text-[13px] text-ink-600 leading-relaxed whitespace-pre-wrap">
                {ex.answer}
              </p>
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex items-center gap-2 text-xs text-ink-400 py-2">
            <RefreshCw size={12} className="animate-spin" />
            <span>{loadingLabel}</span>
          </div>
        )}

        {error && (
          <div className="text-[12px] text-seal leading-relaxed py-1">
            <span className="font-medium">{errorHint}：</span>
            {error}
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleRetry();
              }}
              className="ml-2 underline underline-offset-2 hover:text-seal/80"
            >
              {retryLabel}
            </button>
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} className="flex items-center gap-2">
        <input
          ref={inputRef}
          type="text"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder={placeholder}
          disabled={loading}
          className="flex-1 min-w-0 px-3 py-2 text-[13px] text-ink-900 bg-paper border border-line rounded-lg outline-none transition-shadow placeholder:text-ink-300 focus:border-seal/50 focus:ring-2 focus:ring-seal/20 disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={!question.trim() || loading}
          className="shrink-0 p-2 rounded-lg bg-ink-900 text-paper hover:bg-ink-800 disabled:opacity-40 disabled:hover:bg-ink-900 transition-colors"
          title={submitLabel}
        >
          <Send size={14} />
        </button>
      </form>
    </div>
  );
}
