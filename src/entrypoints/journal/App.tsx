import { useState, useEffect, useRef } from "react";
import { Card } from "@/lib/types";
import { getCards, deleteCard, deleteCards, restoreCard, updateCard } from "@/lib/storage";
import { formatRelativeDate, formatPublishedDate, dayGroup, type DayGroup } from "@/lib/utils";
import {
  getAIConfig,
  generateInsight,
  getCachedInsight,
  saveCachedInsight,
  deleteCachedInsight,
  Insight,
} from "@/lib/ai";
import { getLang, setLang, t, type Lang } from "@/lib/i18n";
import { siteColor } from "@/lib/ui";
import { LanguageControl, ThemeControl, AIConfigForm } from "@/components/AISettings";
import { Trash2, ArrowUpRight, ArrowLeft, Search, Pencil, Sparkles, RefreshCw, Link2, Lightbulb, Compass, Brain, PenLine, Settings, X, Download, Check, Square } from "lucide-react";

const GROUP_ORDER: { key: DayGroup; labelKey: string }[] = [
  { key: "today", labelKey: "groupToday" },
  { key: "yesterday", labelKey: "groupYesterday" },
  { key: "earlier", labelKey: "groupEarlier" },
];

/** Wrap every occurrence of `query` in a <mark> for search highlighting. */
function highlight(text: string, query: string): React.ReactNode {
  if (!query) return text;
  const lower = text.toLowerCase();
  const q = query.toLowerCase();
  const parts: React.ReactNode[] = [];
  let i = 0;
  for (;;) {
    const j = lower.indexOf(q, i);
    if (j === -1) {
      parts.push(text.slice(i));
      break;
    }
    if (j > i) parts.push(text.slice(i, j));
    parts.push(
      <mark key={j} className="bg-seal-soft text-inherit rounded-[2px]">
        {text.slice(j, j + q.length)}
      </mark>
    );
    i = j + q.length;
  }
  return parts;
}

export default function App() {
  const [cards, setCards] = useState<Card[]>([]);
  const [query, setQuery] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingThoughtId, setEditingThoughtId] = useState<string | null>(null);
  const [insightCardId, setInsightCardId] = useState<string | null>(null);
  const [insight, setInsight] = useState<Insight | null>(null);
  const [insightLoading, setInsightLoading] = useState(false);
  const [insightError, setInsightError] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [lang, setLangState] = useState<Lang>("zh");
  const [loading, setLoading] = useState(true);
  type PendingDelete =
    | { type: "single"; card: Card; index: number }
    | { type: "batch"; items: { card: Card; index: number }[] };
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectionMode, setSelectionMode] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const exportRef = useRef<HTMLDivElement>(null);
  const pendingDeleteRef = useRef<PendingDelete | null>(null);
  const deleteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shiftRef = useRef(false);
  const insightRequestRef = useRef(0);

  /** Close the current tab reliably, whether it was opened by the extension or not. */
  async function closeCurrentTab() {
    if (history.length > 1) {
      history.back();
      return;
    }
    try {
      const tab = await chrome.tabs.getCurrent();
      if (tab?.id) {
        await chrome.tabs.remove(tab.id);
      }
    } catch {
      // Fallback for non-tab contexts (e.g. embedded popup).
      window.close();
    }
  }

  const tr = (key: string, vars?: Record<string, string | number>) => t(key, lang, vars);

  useEffect(() => {
    getCards().then((c) => { setCards(c); setLoading(false); });
    getLang().then(setLangState);

    // Sync cards when changed from content script or popup
    const listener = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area === "local" && changes.glean_cards) {
        setCards(changes.glean_cards.newValue ?? []);
      }
    };
    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }, []);

  // Deep link: journal.html#<cardId> expands and scrolls to that card.
  // Handles both fresh loads and same-tab hash changes (popup reuses the tab).
  // The hash is cleaned up afterwards so repeated opens stay a single entry.
  useEffect(() => {
    if (loading) return;
    const applyHash = () => {
      const id = window.location.hash.slice(1);
      if (!id) return;
      setExpandedId(id);
      requestAnimationFrame(() => {
        document.getElementById(`card-${id}`)?.scrollIntoView({ block: "center" });
      });
      window.history.replaceState(null, "", window.location.pathname);
    };
    applyHash();
    window.addEventListener("hashchange", applyHash);
    return () => window.removeEventListener("hashchange", applyHash);
  }, [loading]);

  // Close the export menu on outside click
  useEffect(() => {
    if (!showExport) return;
    const onDown = (e: MouseEvent) => {
      if (!exportRef.current?.contains(e.target as Node)) setShowExport(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [showExport]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (showExport) {
          setShowExport(false);
        } else if (showSettings) {
          setShowSettings(false);
        } else if (editingThoughtId) {
          setEditingThoughtId(null);
        } else if (selectionMode) {
          setSelectionMode(false);
          setSelectedIds(new Set());
        } else if (expandedId) {
          setExpandedId(null);
        } else if (query) {
          setQuery("");
        } else {
          void closeCurrentTab();
        }
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "f") {
        e.preventDefault();
        searchRef.current?.focus();
        return;
      }

      if (e.key === "/" && !e.ctrlKey && !e.metaKey) {
        const target = e.target as HTMLElement;
        if (target.tagName !== "INPUT" && target.tagName !== "TEXTAREA") {
          e.preventDefault();
          searchRef.current?.focus();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [query, expandedId, editingThoughtId, showSettings, showExport, selectionMode]);

  const handleSetLang = async (l: Lang) => {
    await setLang(l);
    setLangState(l);
  };

  const handleBack = () => {
    // If the page has browser history, go back; otherwise close the tab/popup.
    void closeCurrentTab();
  };

  const clearDeleteTimer = () => {
    if (deleteTimerRef.current) {
      clearTimeout(deleteTimerRef.current);
      deleteTimerRef.current = null;
    }
  };

  const scheduleToastDismiss = () => {
    clearDeleteTimer();
    deleteTimerRef.current = setTimeout(() => {
      pendingDeleteRef.current = null;
      setPendingDelete(null);
    }, 4500);
  };

  const handleDelete = async (id: string) => {
    const index = cards.findIndex((c) => c.id === id);
    if (index === -1) return;
    const card = cards[index];
    if (expandedId === id) setExpandedId(null);
    await deleteCard(id); // storage listener updates `cards`
    void deleteCachedInsight(id);
    const payload: PendingDelete = { type: "single", card, index };
    pendingDeleteRef.current = payload;
    setPendingDelete(payload);
    scheduleToastDismiss();
  };

  const handleUndoDelete = async () => {
    clearDeleteTimer();
    const pending = pendingDeleteRef.current;
    pendingDeleteRef.current = null;
    setPendingDelete(null);
    if (!pending) return;
    if (pending.type === "batch") {
      // Restore in ascending original-index order so cards land back in the
      // correct positions after the array shifts during re-insertion.
      const sorted = [...pending.items].sort((a, b) => a.index - b.index);
      for (const item of sorted) {
        await restoreCard(item.card, item.index);
      }
    } else {
      await restoreCard(pending.card, pending.index);
    }
  };

  const handleSaveThought = async (id: string, thought: string) => {
    await updateCard(id, { thought });
    setCards((prev) =>
      prev.map((c) => (c.id === id ? { ...c, thought } : c))
    );
    setEditingThoughtId(null);
  };

  const handleInsight = async (cardId: string, force = false) => {
    if (insightCardId === cardId && !force) {
      setInsightCardId(null);
      setInsight(null);
      return;
    }

    const config = await getAIConfig();
    if (!config) {
      setShowSettings(true);
      return;
    }

    const card = cards.find((c) => c.id === cardId);
    if (!card) return;

    setInsightCardId(cardId);
    setInsightError(null);

    if (!force) {
      const cached = await getCachedInsight(card);
      if (cached) {
        setInsight(cached);
        setInsightLoading(false);
        return;
      }
    }

    setInsightLoading(true);
    setInsight(null);

    const requestId = ++insightRequestRef.current;

    try {
      const result = await generateInsight(config, card, cards, lang);
      // Ignore stale responses: the user may have switched to another card.
      if (insightRequestRef.current !== requestId) return;
      setInsight(result);
      void saveCachedInsight(card, result);
    } catch (err) {
      if (insightRequestRef.current !== requestId) return;
      setInsightError(err instanceof Error ? err.message : tr("genFail"));
    } finally {
      if (insightRequestRef.current === requestId) {
        setInsightLoading(false);
      }
    }
  };

  const downloadFile = (filename: string, content: string, mime: string) => {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportCards = (format: "md" | "json", cardsToExport: Card[]) => {
    const date = new Date().toISOString().slice(0, 10);
    if (format === "json") {
      downloadFile(
        `glean-${date}.json`,
        JSON.stringify(cardsToExport, null, 2),
        "application/json"
      );
      return;
    }
    const lines = cardsToExport.map((c) => {
      const site = c.source.siteName || c.source.heading || c.source.title;
      const parts = [
        `> ${c.content.replace(/\n/g, "\n> ")}`,
        `>\n> — [${site}](${c.source.url})`,
      ];
      if (c.thought) parts.push(`\n**${tr("thoughts")}:** ${c.thought}`);
      return parts.join("\n");
    });
    downloadFile(
      `glean-${date}.md`,
      `# Glean — ${date}\n\n${lines.join("\n\n---\n\n")}\n`,
      "text/markdown"
    );
  };

  const handleExport = (format: "md" | "json") => {
    setShowExport(false);
    exportCards(format, cards);
  };

  const toggleSelection = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    const allFilteredIds = new Set(filtered.map((c) => c.id));
    const allSelected =
      filtered.length > 0 &&
      filtered.every((c) => selectedIds.has(c.id));
    setSelectedIds(allSelected ? new Set() : allFilteredIds);
  };

  const handleBatchDelete = async () => {
    if (selectedIds.size === 0) return;
    const ids = Array.from(selectedIds);
    const items = ids
      .map((id) => {
        const index = cards.findIndex((c) => c.id === id);
        const card = cards.find((c) => c.id === id);
        return card ? { card, index } : null;
      })
      .filter((item): item is { card: Card; index: number } => item !== null);

    if (expandedId && selectedIds.has(expandedId)) setExpandedId(null);
    await deleteCards(ids);
    void Promise.all(ids.map((id) => deleteCachedInsight(id)));

    const payload: PendingDelete = { type: "batch", items };
    pendingDeleteRef.current = payload;
    setPendingDelete(payload);
    setSelectionMode(false);
    setSelectedIds(new Set());
    scheduleToastDismiss();
  };

  const handleBatchExport = (format: "md" | "json") => {
    const selected = cards.filter((c) => selectedIds.has(c.id));
    if (selected.length === 0) return;
    exportCards(format, selected);
    setSelectionMode(false);
    setSelectedIds(new Set());
  };

  const filtered = cards.filter((c) => {
    if (!query) return true;
    const q = query.toLowerCase();
    return (
      c.content.toLowerCase().includes(q) ||
      c.thought?.toLowerCase().includes(q) ||
      c.source.heading?.toLowerCase().includes(q) ||
      c.source.siteName?.toLowerCase().includes(q) ||
      c.source.author?.toLowerCase().includes(q)
    );
  });

  const groups = GROUP_ORDER.map((g) => ({
    ...g,
    cards: filtered.filter((c) => dayGroup(c.createdAt) === g.key),
  })).filter((g) => g.cards.length > 0);

  const renderCard = (card: Card) => {
    const expanded = expandedId === card.id;
    const site = card.source.siteName || card.source.heading || card.source.url;
    const selected = selectedIds.has(card.id);
    return (
      <article
        key={card.id}
        id={`card-${card.id}`}
        className={`group border-b border-line-soft py-5 ${
          selectionMode ? "cursor-pointer" : ""
        }`}
        onClick={
          selectionMode
            ? () => toggleSelection(card.id)
            : undefined
        }
      >
        <div className="flex items-start gap-3">
          {selectionMode && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                toggleSelection(card.id);
              }}
              className={`shrink-0 mt-0.5 p-0.5 rounded transition-colors ${
                selected
                  ? "text-seal"
                  : "text-ink-300 hover:text-ink-500"
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
                  setExpandedId(expanded ? null : card.id);
                  setEditingThoughtId(null);
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
                  onBlur={(e) => handleSaveThought(card.id, e.target.value)}
                  onKeyDown={(e) => {
                    shiftRef.current = e.shiftKey;
                    const isEnter = e.key === "Enter" || e.keyCode === 13 || e.code === "Enter";
                    if (isEnter && e.shiftKey) {
                      // Let Shift+Enter insert a newline (default behavior).
                      return;
                    }
                    if (isEnter && !e.nativeEvent.isComposing) {
                      e.preventDefault();
                      e.stopPropagation();
                      handleSaveThought(card.id, e.currentTarget.value);
                    }
                    if (e.key === "Escape") {
                      e.preventDefault();
                      e.stopPropagation();
                      setEditingThoughtId(null);
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
                      handleSaveThought(card.id, e.currentTarget.value);
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
                      e.preventDefault();
                      e.stopPropagation();
                      target.value = target.value.slice(0, -1);
                      handleSaveThought(card.id, target.value);
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
                    setEditingThoughtId(card.id);
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
                  setEditingThoughtId(card.id);
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
                handleInsight(card.id);
              }}
              className={`opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-all p-1 rounded ${
                insightCardId === card.id ? "text-seal opacity-100" : "text-ink-300 hover:text-seal"
              }`}
              title={tr("aiTooltip")}
            >
              <Sparkles size={13} />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleDelete(card.id);
              }}
              className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 text-ink-300 hover:text-seal transition-all p-1 rounded"
              title={tr("delete")}
            >
              <Trash2 size={13} />
            </button>
          </div>
        </div>

        {/* Insight panel */}
        {insightCardId === card.id && (
          <div className="mt-4 bg-surface border border-line-soft rounded-xl px-4 py-3.5">
            <div className="flex items-center justify-between">
              {insightLoading ? (
                <div className="flex items-center gap-2 text-xs text-ink-400 py-3">
                  <RefreshCw size={13} className="animate-spin" />
                  <span>{tr("insightLoading")}</span>
                </div>
              ) : (
                <span />
              )}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleInsight(card.id, true);
                }}
                disabled={insightLoading}
                className="p-1 text-ink-300 hover:text-seal transition-colors disabled:opacity-40"
                title={tr("insightRefresh")}
              >
                <RefreshCw size={12} />
              </button>
            </div>

            {insightError && (
              <div className="text-xs text-seal py-2">
                {insightError}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleInsight(card.id, true);
                  }}
                  className="ml-2 underline underline-offset-2"
                >
                  {tr("insightRetry")}
                </button>
              </div>
            )}

            {insight && (
              <div className="space-y-3.5">
                <div>
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <Lightbulb size={12} className="text-ochre" />
                    <span className="text-[10px] font-medium uppercase tracking-[0.1em] text-ink-400">{tr("insightReflect")}</span>
                  </div>
                  <p className="text-[13px] text-ink-600 leading-relaxed pl-5">{insight.reflection}</p>
                </div>

                {insight.connections.length > 0 && (
                  <div>
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <Link2 size={12} className="text-sage" />
                      <span className="text-[10px] font-medium uppercase tracking-[0.1em] text-ink-400">{tr("insightConnect")}</span>
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
                    <span className="text-[10px] font-medium uppercase tracking-[0.1em] text-ink-400">{tr("insightPattern")}</span>
                  </div>
                  <p className="text-[13px] text-ink-600 leading-relaxed pl-5">{insight.thinkingPattern}</p>
                </div>

                {insight.suggestions.length > 0 && (
                  <div>
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <Brain size={12} className="text-ink-600" />
                      <span className="text-[10px] font-medium uppercase tracking-[0.1em] text-ink-400">{tr("insightSuggest")}</span>
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
                    handleInsight(card.id);
                  }}
                  className="text-[11px] text-ink-300 hover:text-ink-600 transition-colors"
                >
                  {tr("insightCollapse")}
                </button>
              </div>
            )}
          </div>
        )}
          </div>
        </div>
      </article>
    );
  };

  return (
    <div className="min-h-screen bg-paper">
      {/* Header */}
      <header className="sticky top-0 bg-paper/90 backdrop-blur-sm border-b border-line-soft z-10">
        <div className="max-w-[680px] mx-auto px-6 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={handleBack}
              className="text-ink-400 hover:text-ink-600 transition-colors shrink-0"
              title={tr("back")}
            >
              <ArrowLeft size={18} />
            </button>
            <h1 className="font-quote text-[20px] font-semibold tracking-tight text-ink-900">
              {tr("title")}
            </h1>
            <span className="font-quote text-[13px] text-ink-300 tabular-nums shrink-0">
              {tr("cardCount", { count: cards.length })}
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
                onChange={(e) => setQuery(e.target.value)}
                placeholder={tr("search")}
                className="pl-8 pr-8 py-1.5 text-sm w-56 text-ink-900 border border-line rounded-lg bg-surface outline-none transition-shadow placeholder:text-ink-300 focus:border-seal/50 focus:ring-2 focus:ring-seal/20"
              />
              {query ? (
                <button
                  onClick={() => { setQuery(""); searchRef.current?.focus(); }}
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
            {cards.length > 0 && (
              <div className="relative" ref={exportRef}>
                <button
                  onClick={() => setShowExport(!showExport)}
                  className="p-1.5 text-ink-400 hover:text-ink-600 hover:bg-surface rounded-lg transition-colors"
                  title={tr("exportData")}
                >
                  <Download size={16} />
                </button>
                {showExport && (
                  <div className="absolute right-0 top-full mt-1 w-44 bg-surface border border-line-soft rounded-xl shadow-lg py-1 z-20">
                    <button
                      onClick={() => handleExport("md")}
                      className="w-full text-left px-3 py-2 text-xs text-ink-600 hover:bg-line-soft transition-colors"
                    >
                      {tr("exportMarkdown")}
                    </button>
                    <button
                      onClick={() => handleExport("json")}
                      className="w-full text-left px-3 py-2 text-xs text-ink-600 hover:bg-line-soft transition-colors"
                    >
                      {tr("exportJSON")}
                    </button>
                  </div>
                )}
              </div>
            )}
            {cards.length > 0 && !selectionMode && (
              <button
                onClick={() => setSelectionMode(true)}
                className="px-2 py-1 text-xs text-ink-500 hover:text-ink-700 hover:bg-surface rounded-lg transition-colors"
                title={tr("select")}
              >
                {tr("select")}
              </button>
            )}
            <button
              onClick={() => setShowSettings(true)}
              className="p-1.5 text-ink-400 hover:text-ink-600 hover:bg-surface rounded-lg transition-colors"
              title={tr("settingsTitle")}
            >
              <Settings size={16} />
            </button>
          </div>
        </div>
      </header>

      {/* Selection action bar */}
      {selectionMode && (
        <div className="sticky top-[65px] bg-paper/95 backdrop-blur-sm border-b border-line-soft z-10">
          <div className="max-w-[680px] mx-auto px-6 py-2.5 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <button
                onClick={toggleSelectAll}
                className="text-xs text-ink-500 hover:text-ink-700 transition-colors"
              >
                {filtered.length > 0 && filtered.every((c) => selectedIds.has(c.id))
                  ? tr("deselectAll")
                  : tr("selectAll")}
              </button>
              <span className="text-xs text-ink-400">
                {tr("selectedCount", { count: selectedIds.size })}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => handleBatchExport("md")}
                disabled={selectedIds.size === 0}
                className="px-2.5 py-1.5 text-xs text-ink-600 hover:bg-line-soft disabled:opacity-40 disabled:hover:bg-transparent rounded-lg transition-colors"
              >
                {tr("exportMarkdown")}
              </button>
              <button
                onClick={() => handleBatchExport("json")}
                disabled={selectedIds.size === 0}
                className="px-2.5 py-1.5 text-xs text-ink-600 hover:bg-line-soft disabled:opacity-40 disabled:hover:bg-transparent rounded-lg transition-colors"
              >
                {tr("exportJSON")}
              </button>
              <button
                onClick={handleBatchDelete}
                disabled={selectedIds.size === 0}
                className="px-2.5 py-1.5 text-xs text-seal hover:bg-seal/10 disabled:opacity-40 disabled:hover:bg-transparent rounded-lg transition-colors"
              >
                {tr("batchDelete")}
              </button>
              <button
                onClick={() => {
                  setSelectionMode(false);
                  setSelectedIds(new Set());
                }}
                className="px-2.5 py-1.5 text-xs text-ink-400 hover:text-ink-600 hover:bg-line-soft rounded-lg transition-colors"
              >
                {tr("cancelSelection")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cards */}
      <main className="max-w-[680px] mx-auto px-6 py-6 pb-24">
        {loading ? (
          <div className="animate-pulse">
            {[0, 1, 2].map((i) => (
              <div key={i} className="py-5 border-b border-line-soft">
                <div className="h-4 bg-line-soft rounded w-11/12 mb-2.5" />
                <div className="h-4 bg-line-soft rounded w-2/3 mb-4" />
                <div className="h-3 bg-line-soft rounded w-1/4" />
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="font-quote italic text-[44px] leading-none text-seal/30 mb-4 select-none">“</div>
            <p className="text-sm text-ink-400">
              {query ? tr("noMatch") : tr("noCards")}
            </p>
            {!query && (
              <p className="text-xs text-ink-300 mt-2 max-w-xs leading-relaxed">
                {tr("emptyDesc")}
              </p>
            )}
          </div>
        ) : query ? (
          <div>{filtered.map(renderCard)}</div>
        ) : (
          groups.map((g) => (
            <section key={g.key}>
              <div className="flex items-center gap-2 mt-6 mb-1 first:mt-0">
                <h2 className="text-[10px] font-medium uppercase tracking-[0.12em] text-ink-400">
                  {tr(g.labelKey)}
                </h2>
                <div className="flex-1 h-px bg-line-soft" />
              </div>
              <div>{g.cards.map(renderCard)}</div>
            </section>
          ))
        )}
      </main>

      {/* Undo-delete toast */}
      {pendingDelete && (
        <div
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-4 bg-ink-900 text-paper rounded-full pl-5 pr-4 py-2.5 shadow-xl animate-[toast-up_.25s_ease-out]"
          onMouseEnter={clearDeleteTimer}
          onMouseLeave={scheduleToastDismiss}
        >
          <span className="text-xs">
            {pendingDelete.type === "batch"
              ? tr("batchDeletedToast", { count: pendingDelete.items.length })
              : tr("deletedToast")}
          </span>
          <button
            onClick={handleUndoDelete}
            className="text-xs font-medium underline decoration-seal decoration-2 underline-offset-[3px] hover:opacity-75 transition-opacity"
          >
            {tr("undo")}
          </button>
        </div>
      )}

      {/* Settings modal */}
      {showSettings && (
        <div className="fixed inset-0 bg-ink-900/25 flex items-center justify-center z-50" onClick={() => setShowSettings(false)}>
          <div className="bg-surface rounded-2xl border border-line-soft shadow-xl p-6 w-96 max-w-[90vw]" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-quote text-[16px] font-semibold text-ink-900 mb-1.5">{tr("settingsTitle")}</h3>
            <p className="text-xs text-ink-400 leading-relaxed mb-5">
              {tr("settingsDesc")}
            </p>

            <div className="space-y-4 mb-5">
              <div>
                <label className="block text-[10px] font-medium uppercase tracking-[0.12em] text-ink-400 mb-2">{tr("langLabel")}</label>
                <LanguageControl lang={lang} onSetLang={handleSetLang} />
              </div>
              <div>
                <label className="block text-[10px] font-medium uppercase tracking-[0.12em] text-ink-400 mb-2">{tr("themeLabel")}</label>
                <ThemeControl tr={tr} />
              </div>
              <AIConfigForm tr={tr} onSaved={() => setShowSettings(false)} />
            </div>

            <div className="flex justify-end">
              <button
                onClick={() => setShowSettings(false)}
                className="px-3 py-1.5 text-xs text-ink-600 hover:bg-line-soft rounded-lg transition-colors"
              >
                {tr("cancel")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
