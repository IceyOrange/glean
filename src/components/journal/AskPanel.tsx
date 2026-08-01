import { useState, useRef, useEffect } from "react";
import type { AskExchange, AskScope } from "@/lib/ai";
import { Send, MessageCircleQuestion, ChevronUp } from "lucide-react";

interface AskPanelProps {
  exchanges: AskExchange[];
  loading: boolean;
  error: string | null;
  title: string;
  placeholder: string;
  submitLabel: string;
  collapseLabel: string;
  retryLabel: string;
  emptyHint: string;
  errorHint: string;
  scopeLabel: string;
  scopeOptions: Record<AskScope, string>;
  onAsk: (question: string, scope: AskScope) => void;
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
  retryLabel,
  emptyHint,
  errorHint,
  scopeLabel,
  scopeOptions,
  onAsk,
  onCollapse,
}: AskPanelProps) {
  const [question, setQuestion] = useState("");
  const [failedQuestion, setFailedQuestion] = useState<string | null>(null);
  const [scope, setScope] = useState<AskScope>("related");
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
    onAsk(trimmed, scope);
  };

  const handleRetry = () => {
    const q = failedQuestion;
    if (!q) return;
    onAsk(q, scope);
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
          aria-label={collapseLabel}
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
          <div
            key={i}
            className="animate-journal-card-reveal space-y-1.5"
            style={{ animationDelay: `${i * 40}ms` }}
          >
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
          <div className="space-y-2 py-2">
            <div className="h-3 rounded w-5/6 animate-shimmer" />
            <div className="h-3 rounded w-4/6 animate-shimmer" />
            <div className="h-3 rounded w-3/6 animate-shimmer" />
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

      <div className="mb-2 flex items-center gap-2">
        <label htmlFor="ask-scope" className="text-[11px] text-ink-500">{scopeLabel}</label>
        <select id="ask-scope" value={scope} onChange={(event) => setScope(event.target.value as AskScope)} className="min-h-8 rounded-md border border-line bg-paper px-2 text-[11px] text-ink-700 outline-none focus:border-seal/50 focus:ring-2 focus:ring-seal/20">
          {(Object.keys(scopeOptions) as AskScope[]).map((value) => <option key={value} value={value}>{scopeOptions[value]}</option>)}
        </select>
      </div>
      <form onSubmit={handleSubmit} className="flex items-center gap-2">
        <input
          ref={inputRef}
          aria-label={placeholder}
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
          className="shrink-0 p-2 rounded-lg bg-ink-900 text-paper hover:bg-ink-800 disabled:opacity-40 disabled:hover:bg-ink-900 active:scale-[0.97] transition-[background-color,opacity,transform] duration-150 ease-out-quint"
          title={submitLabel}
          aria-label={submitLabel}
        >
          <Send size={14} />
        </button>
      </form>
    </div>
  );
}
