import { memo, useRef } from "react";
import type { Card } from "@/lib/types";
import { Insight } from "@/lib/ai";
import { t, type Lang } from "@/lib/i18n";
import { highlight, siteColor } from "@/lib/ui";
import { formatRelativeDate, formatPublishedDate } from "@/lib/utils";
import { PenLine, Pencil, Sparkles, Trash2, ArrowUpRight, Check, Square } from "lucide-react";
import { InsightPanel } from "./InsightPanel";

interface CardItemProps {
  card: Card;
  query: string;
  lang: Lang;
  expanded: boolean;
  selected: boolean;
  selectionMode: boolean;
  insightOpen: boolean;
  insight: Insight | null;
  insightLoading: boolean;
  insightError: string | null;
  editingThoughtId: string | null;
  onToggleSelection: (id: string) => void;
  onExpand: (id: string) => void;
  onDelete: (id: string) => void;
  onInsight: (id: string, force?: boolean) => void;
  onSaveThought: (id: string, thought: string) => void;
  onStartEditingThought: (id: string) => void;
  onStopEditingThought: () => void;
}

export const CardItem = memo(function CardItem({
  card,
  query,
  lang,
  expanded,
  selected,
  selectionMode,
  insightOpen,
  insight,
  insightLoading,
  insightError,
  editingThoughtId,
  onToggleSelection,
  onExpand,
  onDelete,
  onInsight,
  onSaveThought,
  onStartEditingThought,
  onStopEditingThought,
}: CardItemProps) {
  const shiftRef = useRef(false);
  const site = card.source.siteName || card.source.heading || card.source.url;
  const tr = (key: string, vars?: Record<string, string | number>) => t(key, lang, vars);

  return (
    <article
      id={`card-${card.id}`}
      className={`group border-b border-line-soft py-5 ${
        selectionMode ? "cursor-pointer" : ""
      }`}
      onClick={selectionMode ? () => onToggleSelection(card.id) : undefined}
    >
      <div className="flex items-start gap-3">
        {selectionMode && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggleSelection(card.id);
            }}
            className={`shrink-0 mt-0.5 p-0.5 rounded transition-colors ${
              selected ? "text-seal" : "text-ink-300 hover:text-ink-500"
            }`}
            title={selected ? tr("deselectAll") : tr("selectAll")}
          >
            {selected ? <Check size={16} /> : <Square size={16} />}
          </button>
        )}
        <div className="flex-1 min-w-0">
          {/* Quote */}
          <div
            className={selectionMode ? "" : "cursor-pointer"}
            onClick={
              selectionMode
                ? undefined
                : () => {
                    onExpand(card.id);
                    onStopEditingThought();
                  }
            }
          >
            <p className={`font-quote text-[15px] text-ink-900 leading-[1.8] ${expanded ? "" : "line-clamp-3"}`}>
              <span className="text-seal mr-1">“</span>
              {highlight(card.content, query)}
              <span className="text-ink-300 ml-1">”</span>
            </p>
          </div>

          {/* Thought preview — collapsed */}
          {!expanded && card.thought && (
            <div className="mt-2 flex items-start gap-1.5">
              <PenLine size={11} className="text-ink-300 mt-[3px] shrink-0" />
              <p className="font-quote italic text-[13px] text-ink-600 leading-relaxed line-clamp-1">
                {highlight(card.thought, query)}
              </p>
            </div>
          )}

          {/* Thought — expanded (margin-note style) */}
          {expanded && (
            <div className="mt-3 ml-0.5 border-l border-line pl-4">
              {editingThoughtId === card.id ? (
                <div className="flex items-start gap-1.5">
                  <PenLine size={11} className="text-ink-300 mt-2 shrink-0" />
                  <textarea
                    autoFocus
                    defaultValue={card.thought || ""}
                    className="flex-1 font-quote italic text-[13px] text-ink-900 leading-relaxed bg-surface resize-none outline-none border border-line rounded-lg px-3 py-2 transition-shadow focus:border-seal/50 focus:ring-2 focus:ring-seal/20"
                    rows={3}
                    onBlur={(e) => onSaveThought(card.id, e.target.value)}
                    onKeyDown={(e) => {
                      shiftRef.current = e.shiftKey;
                      const isEnter = e.key === "Enter" || e.keyCode === 13 || e.code === "Enter";
                      if (isEnter && e.shiftKey) {
                        return;
                      }
                      if (isEnter && !e.nativeEvent.isComposing) {
                        e.preventDefault();
                        e.stopPropagation();
                        onSaveThought(card.id, e.currentTarget.value);
                      }
                      if (e.key === "Escape") {
                        e.preventDefault();
                        e.stopPropagation();
                        onStopEditingThought();
                      }
                    }}
                    onKeyUp={() => {
                      shiftRef.current = false;
                    }}
                    onBeforeInput={(e) => {
                      const ie = e.nativeEvent as InputEvent;
                      const isLineBreak =
                        ie.inputType === "insertLineBreak" ||
                        ie.inputType === "insertParagraph";
                      if (isLineBreak && !shiftRef.current && !ie.isComposing) {
                        e.preventDefault();
                        e.stopPropagation();
                        onSaveThought(card.id, e.currentTarget.value);
                      }
                    }}
                    onInput={(e) => {
                      const target = e.currentTarget;
                      const ie = e.nativeEvent as InputEvent;
                      if (
                        target.value.endsWith("\n") &&
                        !ie.isComposing &&
                        !shiftRef.current
                      ) {
                        e.preventDefault?.();
                        e.stopPropagation?.();
                        target.value = target.value.slice(0, -1);
                        onSaveThought(card.id, target.value);
                      }
                    }}
                  />
                </div>
              ) : card.thought ? (
                <div className="flex items-start gap-1.5">
                  <PenLine size={11} className="text-ink-300 mt-[3px] shrink-0" />
                  <p className="font-quote italic text-[13px] text-ink-600 leading-relaxed flex-1 whitespace-pre-wrap">
                    {highlight(card.thought, query)}
                  </p>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onStartEditingThought(card.id);
                    }}
                    className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 text-ink-300 hover:text-ink-600 transition-all p-1 shrink-0"
                    title={tr("editThought")}
                  >
                    <Pencil size={12} />
                  </button>
                </div>
              ) : (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onStartEditingThought(card.id);
                  }}
                  className="flex items-center gap-1.5 text-xs text-ink-300 hover:text-seal transition-colors py-1"
                >
                  <PenLine size={11} />
                  {tr("addThought")}
                </button>
              )}
            </div>
          )}

          {/* Source + meta */}
          <div className="mt-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0 text-[11px] text-ink-400">
              {card.source.favicon && (
                <img
                  src={card.source.favicon}
                  alt=""
                  className="w-3.5 h-3.5 rounded-[3px] object-contain shrink-0 opacity-80"
                  onError={(e) =>
                    (e.currentTarget.style.display = "none")
                  }
                />
              )}
              <a
                href={card.source.url}
                target="_blank"
                rel="noopener noreferrer"
                className="group inline-flex items-center gap-0.5 min-w-0 font-medium max-w-[180px] hover:underline underline-offset-2"
                style={{ color: siteColor(site) }}
                title={card.source.title}
                onClick={(e) => e.stopPropagation()}
              >
                <span className="truncate">{site}</span>
                <ArrowUpRight
                  size={9}
                  className="shrink-0 opacity-70 relative -top-0.5 transition-transform duration-200 group-hover:translate-x-[1px] group-hover:-translate-y-[1px]"
                />
              </a>
              {card.source.author && (
                <>
                  <span className="text-ink-300">·</span>
                  <span className="truncate max-w-[120px]">
                    {card.source.author}
                  </span>
                </>
              )}
              {card.source.publishedAt && (
                <>
                  <span className="text-ink-300">·</span>
                  <span>
                    {formatPublishedDate(card.source.publishedAt, lang)}
                  </span>
                </>
              )}
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <span className="text-[11px] text-ink-300 tabular-nums">
                {formatRelativeDate(card.createdAt, lang)}
              </span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onInsight(card.id);
                }}
                className={`opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-all p-1 rounded ${
                  insightOpen ? "text-seal opacity-100" : "text-ink-300 hover:text-seal"
                }`}
                title={tr("aiTooltip")}
              >
                <Sparkles size={13} />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(card.id);
                }}
                className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 text-ink-300 hover:text-seal transition-all p-1 rounded"
                title={tr("delete")}
              >
                <Trash2 size={13} />
              </button>
            </div>
          </div>

          {/* Insight panel */}
          {insightOpen && (
            <InsightPanel
              insight={insight}
              loading={insightLoading}
              error={insightError}
              reflectLabel={tr("insightReflect")}
              connectLabel={tr("insightConnect")}
              patternLabel={tr("insightPattern")}
              suggestLabel={tr("insightSuggest")}
              loadingLabel={tr("insightLoading")}
              retryLabel={tr("insightRetry")}
              refreshLabel={tr("insightRefresh")}
              collapseLabel={tr("insightCollapse")}
              genFail={tr("genFail")}
              onRefresh={() => onInsight(card.id, true)}
              onCollapse={() => onInsight(card.id)}
            />
          )}
        </div>
      </div>
    </article>
  );
});
