import { memo, useRef } from "react";
import type { Card } from "@/lib/types";
import type { AskExchange, AskScope } from "@/lib/ai";
import { t, type Lang } from "@/lib/i18n";
import { highlight, siteColor, siteName } from "@/lib/ui";
import { formatPublishedDate } from "@/lib/utils";
import { PenLine, Pencil, MessageCircleQuestion, Trash2, ArrowUpRight, Check, Square } from "lucide-react";
import { AskPanel } from "./AskPanel";

/**
 * Reduce a raw page <title> to a useful citation title:
 * strip a redundant " — Site" style suffix, and drop it entirely when it
 * just repeats the site or author name (very common in real page titles).
 */
function citationTitle(title: string | undefined, site: string, author?: string): string {
  const t = title?.trim() ?? "";
  if (!t || t === site) return "";
  const s = site.trim();
  let cleaned = t;
  if (s && cleaned.toLowerCase().endsWith(s.toLowerCase()) && cleaned.length > s.length) {
    cleaned = cleaned.slice(0, cleaned.length - s.length).replace(/[\s\-–—|·:：_]+$/u, "").trim();
  }
  if (!cleaned || cleaned === site || (author && cleaned === author.trim())) return "";
  return cleaned;
}

interface CardItemProps {
  card: Card;
  query: string;
  lang: Lang;
  /** Pre-formatted capture time — HH:mm in the day timeline, full date in search results. */
  timeLabel: string;
  expanded: boolean;
  selected: boolean;
  selectionMode: boolean;
  askOpen: boolean;
  askExchanges: AskExchange[];
  askLoading: boolean;
  askError: string | null;
  editingThoughtId: string | null;
  onToggleSelection: (id: string) => void;
  onExpand: (id: string) => void;
  onDelete: (id: string) => void;
  onToggleAsk: (id: string) => void;
  onAsk: (id: string, question: string, scope: AskScope) => void;
  onSaveThought: (id: string, thought: string) => void;
  onStartEditingThought: (id: string) => void;
  onStopEditingThought: () => void;
}

export const CardItem = memo(function CardItem({
  card,
  query,
  lang,
  timeLabel,
  expanded,
  selected,
  selectionMode,
  askOpen,
  askExchanges,
  askLoading,
  askError,
  editingThoughtId,
  onToggleSelection,
  onExpand,
  onDelete,
  onToggleAsk,
  onAsk,
  onSaveThought,
  onStartEditingThought,
  onStopEditingThought,
}: CardItemProps) {
  const shiftRef = useRef(false);
  const site = siteName(card.source);
  const titleText = citationTitle(card.source.title, site, card.source.author);
  const tr = (key: string, vars?: Record<string, string | number>) => t(key, lang, vars);

  const quoteClickable = !selectionMode;

  // A click that ends with text selected was an attempt to copy, not to
  // expand/collapse — ignore it.
  const hasTextSelection = () => {
    const sel = window.getSelection();
    return !!sel && sel.toString().length > 0;
  };

  // Save only when the text actually changed — updateCard bumps updatedAt,
  // and a no-op save would look like a fresh edit to the sync layer.
  const commitThought = (value: string) => {
    if (value !== (card.thought ?? "")) onSaveThought(card.id, value);
    else onStopEditingThought();
  };

  return (
    <article
      id={`card-${card.id}`}
      className={`group scroll-mt-24 border-b border-line-soft py-6 transition-colors duration-200 ease-out last:border-b-0 [content-visibility:auto] [contain-intrinsic-size:auto_190px] ${
        selected ? "bg-seal/[0.04] hover:bg-seal/[0.06]" : "hover:bg-surface/40"
      } ${selectionMode ? "cursor-pointer" : ""}`}
      onClick={selectionMode ? () => onToggleSelection(card.id) : undefined}
    >
      <div className="flex items-start gap-2">
        {selectionMode && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggleSelection(card.id);
            }}
            className={`mt-1 shrink-0 rounded p-0.5 transition-colors ${
              selected ? "text-seal" : "text-ink-300 hover:text-ink-600"
            }`}
            title={selected ? tr("deselectCard") : tr("selectCard")}
            aria-label={selected ? tr("deselectCard") : tr("selectCard")}
          >
            {selected ? <Check size={16} /> : <Square size={16} />}
          </button>
        )}

        {/* Entry column — everything aligns to the quote text; the “ mark hangs outside */}
        <div className="relative min-w-0 flex-1 pl-7">
          <span
            aria-hidden="true"
            className="absolute left-0 top-[3px] select-none font-quote text-[28px] leading-[0.8] text-seal/70"
          >
            “
          </span>

          {/* Quote — always visible; line-clamped to 3 lines when collapsed,
              click to expand the full text. (Never wrap this in the 0fr/1fr
              collapse grid — that hides the quote entirely.) */}
          <div
            className={quoteClickable ? "cursor-pointer rounded outline-none focus-visible:ring-2 focus-visible:ring-seal/40" : ""}
            role={quoteClickable ? "button" : undefined}
            tabIndex={quoteClickable ? 0 : undefined}
            aria-expanded={quoteClickable ? expanded : undefined}
            onClick={
              quoteClickable
                ? () => {
                    if (hasTextSelection()) return;
                    onExpand(card.id);
                  }
                : undefined
            }
            onKeyDown={(event) => {
              if (!quoteClickable || (event.key !== "Enter" && event.key !== " ")) return;
              event.preventDefault();
              onExpand(card.id);
            }}
          >
            <p
              className={`font-quote text-[15px] text-ink-900 leading-[1.75] ${
                expanded ? "" : "line-clamp-3"
              }`}
            >
              {highlight(card.content, query)}
              <span className="text-seal/40 ml-[2px]">”</span>
            </p>
          </div>

          {/* Thought preview — collapsed. Always clickable: expands the card
              straight into thought editing, so a thought is editable in every
              card state (even short-quote + short-thought, which has nothing
              clamped). In selection mode it stays inert so the click bubbles
              up and toggles selection like the rest of the card. */}
          {!expanded && card.thought && (
            <div className="mt-2.5 flex items-start gap-1.5">
              <PenLine size={11} className="text-ochre/70 mt-[4px] shrink-0" />
              <p
                onClick={
                  selectionMode
                    ? undefined
                    : () => {
                        onExpand(card.id);
                        onStartEditingThought(card.id);
                      }
                }
                title={selectionMode ? undefined : tr("editThought")}
                role={selectionMode ? undefined : "button"}
                tabIndex={selectionMode ? undefined : 0}
                onKeyDown={(event) => {
                  if (selectionMode || (event.key !== "Enter" && event.key !== " ")) return;
                  event.preventDefault();
                  onExpand(card.id);
                  onStartEditingThought(card.id);
                }}
                className={`font-quote italic text-[13px] text-ink-600 leading-relaxed line-clamp-1 ${
                  selectionMode
                    ? ""
                    : "cursor-pointer rounded -mx-1 px-1 transition-colors hover:text-ink-800 hover:bg-ochre/5"
                }`}
              >
                {highlight(card.thought, query)}
              </p>
            </div>
          )}

          {/* Add-thought affordance for unexpanded cards without a thought */}
          {!expanded && !card.thought && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onExpand(card.id);
                onStartEditingThought(card.id);
              }}
              className="mt-2 flex items-center gap-1.5 text-[11px] text-ink-400 hover:text-seal transition-colors py-1"
            >
              <PenLine size={11} />
              {tr("addThought")}
            </button>
          )}

          {/* Thought — expanded */}
          {expanded && (
            <div>
              <div className="mt-4 rounded-xl bg-surface/70 px-4 py-3">
                {editingThoughtId === card.id ? (
                  <textarea
                    autoFocus
                    defaultValue={card.thought || ""}
                    className="w-full font-quote italic text-[13px] text-ink-900 leading-relaxed bg-paper resize-none outline-none border border-line rounded-lg px-3 py-2 transition-shadow focus:border-seal/50 focus:ring-2 focus:ring-seal/20"
                    rows={3}
                    onBlur={(e) => commitThought(e.target.value)}
                    onKeyDown={(e) => {
                      shiftRef.current = e.shiftKey;
                      const isEnter = e.key === "Enter" || e.keyCode === 13 || e.code === "Enter";
                      if (isEnter && e.shiftKey) {
                        return;
                      }
                      if (isEnter && !e.nativeEvent.isComposing) {
                        e.preventDefault();
                        e.stopPropagation();
                        commitThought(e.currentTarget.value);
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
                        commitThought(e.currentTarget.value);
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
                        commitThought(target.value);
                      }
                    }}
                  />
                ) : card.thought ? (
                  <div className="flex items-start gap-2">
                    <PenLine size={11} className="text-ochre/70 mt-[4px] shrink-0" />
                    <p
                      onClick={(e) => {
                        e.stopPropagation();
                        onStartEditingThought(card.id);
                      }}
                      title={tr("editThought")}
                      className="font-quote italic text-[13px] text-ink-700 leading-relaxed flex-1 whitespace-pre-wrap cursor-text rounded -mx-1 px-1 py-0.5 transition-colors hover:bg-ochre/5"
                    >
                      {highlight(card.thought, query)}
                    </p>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onStartEditingThought(card.id);
                      }}
                      className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100 min-w-7 min-h-7 inline-flex items-center justify-center text-ink-300 hover:text-ink-600 transition-[opacity,color] duration-200 ease-out-quart shrink-0"
                      title={tr("editThought")}
                      aria-label={tr("editThought")}
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
                    className="flex items-center gap-1.5 text-xs text-ink-500 hover:text-seal transition-colors py-1"
                  >
                    <PenLine size={11} />
                    {tr("addThought")}
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Citation + capture time + actions */}
          <div className="mt-4 flex items-start justify-between gap-3">
            <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 min-w-0 text-[11px] text-ink-500">
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
                className="group inline-flex items-center gap-0.5 shrink-0 max-w-[150px] font-medium hover:underline underline-offset-2"
                style={{ color: siteColor(site) }}
                title={card.source.title}
                onClick={(e) => e.stopPropagation()}
              >
                <span className="truncate">{site}</span>
                <ArrowUpRight
                  size={9}
                  className="shrink-0 opacity-70 relative -top-0.5 transition-transform duration-200 ease-out-quart group-hover:translate-x-[1px] group-hover:-translate-y-[1px]"
                />
              </a>
              {titleText && (
                <>
                  <span className="text-ink-300 shrink-0">·</span>
                  <span
                    className="truncate max-w-[140px] sm:max-w-[220px] text-ink-400"
                    title={card.source.title}
                  >
                    {titleText}
                  </span>
                </>
              )}
              {card.source.author && (
                <>
                  <span className="text-ink-300 shrink-0">·</span>
                  <span className="truncate max-w-[100px]">
                    {card.source.author}
                  </span>
                </>
              )}
              {card.source.publishedAt && (
                <>
                  <span className="text-ink-300 shrink-0">·</span>
                  <span className="shrink-0">
                    {formatPublishedDate(card.source.publishedAt, lang)}
                  </span>
                </>
              )}
            </div>

            <div className="flex items-center gap-1 shrink-0">
              <span className="text-[11px] text-ink-400 tabular-nums">
                {timeLabel}
              </span>
              <div
                className={`flex items-center gap-0.5 transition-opacity duration-200 ${
                  askOpen
                    ? "opacity-100"
                    : "opacity-0 group-hover:opacity-100 focus-within:opacity-100 [@media(hover:none)]:opacity-100"
                }`}
              >
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleAsk(card.id);
                  }}
                  className={`min-w-7 min-h-7 inline-flex items-center justify-center transition-colors rounded ${
                    askOpen ? "text-seal" : "text-ink-300 hover:text-seal"
                  }`}
                  title={tr("askAboutThis")}
                  aria-label={tr("askAboutThis")}
                >
                  <MessageCircleQuestion size={13} />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(card.id);
                  }}
                  className="min-w-7 min-h-7 inline-flex items-center justify-center text-ink-300 hover:text-seal transition-colors rounded"
                  title={tr("delete")}
                  aria-label={tr("delete")}
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          </div>

          {/* Ask panel */}
          {askOpen && (
            <AskPanel
              exchanges={askExchanges}
              loading={askLoading}
              error={askError}
              title={tr("askAboutThis")}
              placeholder={tr("askPlaceholder")}
              submitLabel={tr("askSubmit")}
              collapseLabel={tr("askCollapse")}
              retryLabel={tr("askRetry")}
              emptyHint={tr("askEmptyHint")}
              errorHint={tr("askErrorHint")}
              scopeLabel={tr("askScope")}
              scopeOptions={{ card: tr("askScopeCard"), related: tr("askScopeRelated"), library: tr("askScopeLibrary") }}
              onAsk={(question, scope) => onAsk(card.id, question, scope)}
              onCollapse={() => onToggleAsk(card.id)}
            />
          )}
        </div>
      </div>
    </article>
  );
});
