import type { Card } from "@/lib/types";
import { Sparkles } from "lucide-react";

interface RevisitCardProps {
  card: Card;
  site: string;
  /** How long ago the card was captured, localized (e.g. "3 个月前"). */
  timeAgo: string;
  title: string;
  jumpLabel: string;
  onJump: () => void;
}

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
  onJump,
}: RevisitCardProps) {
  return (
    <section aria-label={title} className="mb-12">
      <div className="mb-5 flex items-center gap-3" aria-hidden="true">
        <span className="h-px flex-1 bg-line-soft" />
        <Sparkles size={12} className="text-seal/70" />
        <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-seal/80">
          {title}
        </span>
        <span className="h-px flex-1 bg-line-soft" />
      </div>

      <div
        role="button"
        tabIndex={0}
        title={jumpLabel}
        onClick={onJump}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onJump();
          }
        }}
        className="group cursor-pointer rounded-2xl border border-line-soft bg-surface px-7 py-6 text-center transition-all duration-300 hover:border-seal/30 hover:shadow-[0_4px_28px_-12px_oklch(var(--ink-900)/0.25)]"
      >
        <p className="font-quote text-[15px] leading-[1.9] text-ink-800 line-clamp-3">
          <span className="text-seal/70">“</span>
          {card.content}
          <span className="text-seal/40">”</span>
        </p>
        {card.thought && (
          <p className="mt-2 font-quote italic text-[12.5px] text-ink-500 line-clamp-1">
            — {card.thought}
          </p>
        )}
        <p className="mt-3.5 text-[11px] text-ink-400">
          {site} · {timeAgo}
        </p>
      </div>
    </section>
  );
}
