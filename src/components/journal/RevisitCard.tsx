import type { Card } from "@/lib/types";
import { Sparkles, Shuffle, ChevronDown, ChevronUp } from "lucide-react";
import { useEffect, useState } from "react";

interface RevisitCardProps {
  card: Card;
  site: string;
  /** How long ago the card was captured, localized (e.g. "3 个月前"). */
  timeAgo: string;
  title: string;
  jumpLabel: string;
  shuffleLabel?: string;
  collapseLabel?: string;
  expandLabel?: string;
  collapsedLabel?: string;
  onJump: () => void;
  onShuffle?: () => void;
}

const COLLAPSE_KEY = "glean:journal:revisit:collapsed";

const todayStr = () => new Date().toISOString().slice(0, 10);

/**
 * A daily spotlight resurfacing one older entry above the timeline.
 * Clicking it jumps to the original entry in the list.
 */
export function RevisitCard({
  card,
  site,
  timeAgo,
  title,
  jumpLabel,
  shuffleLabel,
  collapseLabel,
  expandLabel,
  collapsedLabel,
  onJump,
  onShuffle,
}: RevisitCardProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [spinning, setSpinning] = useState(false);

  // Restore today's collapse preference from localStorage.
  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(COLLAPSE_KEY) === todayStr());
    } catch {
      // Ignore storage errors (e.g. private mode restrictions).
    }
  }, []);

  const handleShuffle = (e: React.MouseEvent) => {
    e.stopPropagation();
    setSpinning(true);
    onShuffle?.();
  };

  const handleCollapse = (e: React.MouseEvent) => {
    e.stopPropagation();
    setCollapsed(true);
    try {
      localStorage.setItem(COLLAPSE_KEY, todayStr());
    } catch {
      // Ignore.
    }
  };

  const handleExpand = (e: React.MouseEvent) => {
    e.stopPropagation();
    setCollapsed(false);
    try {
      localStorage.removeItem(COLLAPSE_KEY);
    } catch {
      // Ignore.
    }
  };

  return (
    <section aria-label={title} className="mb-8">
      {collapsed ? (
        <div className="mb-3 flex items-center justify-between gap-3 rounded-lg border border-line-soft bg-surface px-3 py-2">
          <div className="flex items-center gap-2 text-ink-500">
            <Sparkles size={12} className="text-seal/70" />
            <span className="text-[10px] font-semibold uppercase tracking-[0.18em]">
              {title}
            </span>
            <span className="text-[10px] text-ink-300">·</span>
            <span className="text-[10px]">{collapsedLabel}</span>
          </div>
          <div className="flex items-center gap-0.5">
            {onShuffle && (
              <button
                onClick={handleShuffle}
                onAnimationEnd={() => setSpinning(false)}
                className="shrink-0 p-1.5 rounded-full text-ink-400 hover:text-seal hover:bg-line-soft transition-colors focus-visible:outline-offset-2"
                title={shuffleLabel}
                aria-label={shuffleLabel}
              >
                <Shuffle
                  size={14}
                  className={spinning ? "animate-journal-shuffle-spin" : ""}
                />
              </button>
            )}
            <button
              onClick={handleExpand}
              className="shrink-0 p-1.5 rounded-full text-ink-400 hover:text-seal hover:bg-line-soft transition-colors focus-visible:outline-offset-2"
              title={expandLabel}
              aria-label={expandLabel}
              aria-expanded="false"
            >
              <ChevronDown size={14} />
            </button>
          </div>
        </div>
      ) : (
        <div className="mb-3 flex items-center justify-between gap-3" aria-hidden="true">
          <div className="flex flex-1 items-center gap-3">
            <span className="h-px flex-1 bg-line-soft" />
            <Sparkles size={12} className="text-seal/70" />
            <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-seal/80">
              {title}
            </span>
            <span className="h-px flex-1 bg-line-soft" />
          </div>
          <div className="flex items-center gap-0.5">
            {onShuffle && (
              <button
                onClick={handleShuffle}
                onAnimationEnd={() => setSpinning(false)}
                className="shrink-0 p-1.5 rounded-full text-ink-400 hover:text-seal hover:bg-line-soft transition-colors focus-visible:outline-offset-2"
                title={shuffleLabel}
                aria-label={shuffleLabel}
              >
                <Shuffle
                  size={14}
                  className={spinning ? "animate-journal-shuffle-spin" : ""}
                />
              </button>
            )}
            <button
              onClick={handleCollapse}
              className="shrink-0 p-1.5 rounded-full text-ink-400 hover:text-seal hover:bg-line-soft transition-colors focus-visible:outline-offset-2"
              title={collapseLabel}
              aria-label={collapseLabel}
              aria-expanded="true"
            >
              <ChevronUp size={14} />
            </button>
          </div>
        </div>
      )}

      <div
        className={`grid transition-[grid-template-rows] duration-[250ms] ease-out-quint ${
          collapsed ? "grid-rows-[0fr]" : "grid-rows-[1fr]"
        }`}
      >
        <div className="overflow-hidden min-h-0">
          <div
            key={card.id}
            role="button"
            tabIndex={collapsed ? -1 : 0}
            aria-hidden={collapsed}
            title={jumpLabel}
            onClick={collapsed ? undefined : onJump}
            onKeyDown={(e) => {
              if (collapsed) return;
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onJump();
              }
            }}
            className={`animate-journal-spotlight-fade group cursor-pointer rounded-2xl border border-line-soft bg-surface px-5 py-4 text-center transition-[border-color,box-shadow] duration-300 ease-out-quart hover:border-seal/30 hover:shadow-[0_4px_28px_-12px_oklch(var(--ink-900)/0.25)] ${
              collapsed ? "pointer-events-none" : ""
            }`}
          >
            <p className="font-quote text-[15px] leading-[1.75] text-ink-800 line-clamp-3">
              <span className="text-seal/70">“</span>
              {card.content}
              <span className="text-seal/40">”</span>
            </p>
            {card.thought && (
              <p className="mt-2 font-quote italic text-[12.5px] text-ink-500 line-clamp-1">
                — {card.thought}
              </p>
            )}
            <p className="mt-3 text-[11px] text-ink-400">
              {site} · {timeAgo}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
