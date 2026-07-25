import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { Card } from "@/lib/types";
import { getCards, deleteCard, deleteCards, restoreCard, updateCard } from "@/lib/storage";
import {
  dayKey,
  formatTime,
  formatDateTime,
  formatDayLabel,
  getDayGutter,
  formatRelativeDate,
} from "@/lib/utils";
import {
  getAIConfig,
  askAboutCard,
  saveAskExchange,
  getAskHistory,
  deleteAskHistory,
  analyzeMindset,
  type AskExchange,
  type MindsetAnalysis,
} from "@/lib/ai";
import { getLang, setLang, t, type Lang } from "@/lib/i18n";
import { siteName } from "@/lib/ui";
import { SearchHeader } from "@/components/journal/SearchHeader";
import { SelectionBar } from "@/components/journal/SelectionBar";
import { CardItem } from "@/components/journal/CardItem";
import { RevisitCard } from "@/components/journal/RevisitCard";
import { UndoToast, PendingDelete } from "@/components/journal/UndoToast";
import { SettingsModal } from "@/components/journal/SettingsModal";
import { MindsetModal } from "@/components/journal/MindsetModal";
import { EmptyState } from "@/components/journal/EmptyState";
import { Skeleton } from "@/components/journal/Skeleton";

export default function App() {
  const [cards, setCards] = useState<Card[]>([]);
  const [query, setQuery] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingThoughtId, setEditingThoughtId] = useState<string | null>(null);
  const [askCardId, setAskCardId] = useState<string | null>(null);
  const [askExchanges, setAskExchanges] = useState<AskExchange[]>([]);
  const [askLoading, setAskLoading] = useState(false);
  const [askError, setAskError] = useState<string | null>(null);
  const [showMindset, setShowMindset] = useState(false);
  const [mindsetResult, setMindsetResult] = useState<MindsetAnalysis | null>(null);
  const [mindsetLoading, setMindsetLoading] = useState(false);
  const [mindsetError, setMindsetError] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [lang, setLangState] = useState<Lang>("zh");
  const [loading, setLoading] = useState(true);
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectionMode, setSelectionMode] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const pendingDeleteRef = useRef<PendingDelete | null>(null);
  const deleteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const askRequestRef = useRef(0);

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

    const listener = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area === "local" && changes.glean_cards) {
        setCards(changes.glean_cards.newValue ?? []);
      }
    };
    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }, []);

  // Deep link: journal.html#<cardId> expands and scrolls to that card.
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

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (showMindset) {
          setShowMindset(false);
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
  }, [query, expandedId, editingThoughtId, showSettings, selectionMode, showMindset]);

  // Swipe from the left edge to go back (trackpad / touch).
  useEffect(() => {
    const edgeThreshold = 30;
    const swipeThreshold = 80;
    const verticalThreshold = 50;
    let startX = 0;
    let startY = 0;

    const onTouchStart = (e: TouchEvent) => {
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
    };

    const onTouchEnd = (e: TouchEvent) => {
      const endX = e.changedTouches[0].clientX;
      const endY = e.changedTouches[0].clientY;
      const dx = endX - startX;
      const dy = endY - startY;
      if (
        startX <= edgeThreshold &&
        dx > swipeThreshold &&
        Math.abs(dy) < verticalThreshold
      ) {
        void closeCurrentTab();
      }
    };

    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchend", onTouchEnd, { passive: true });
    return () => {
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchend", onTouchEnd);
    };
  }, []);

  const handleSetLang = async (l: Lang) => {
    await setLang(l);
    setLangState(l);
  };

  const handleBack = () => {
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
    if (askCardId === id) {
      setAskCardId(null);
      setAskExchanges([]);
      setAskError(null);
    }
    void deleteAskHistory(id);
    await deleteCard(id);
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

  const handleToggleAskCard = async (cardId: string) => {
    if (askCardId === cardId) {
      setAskCardId(null);
      setAskExchanges([]);
      setAskError(null);
      setAskLoading(false);
      return;
    }

    const config = await getAIConfig();
    if (!config) {
      setShowSettings(true);
      return;
    }

    const history = await getAskHistory(cardId);
    setAskCardId(cardId);
    setAskExchanges(history);
    setAskError(null);
    setAskLoading(false);
  };

  const handleAsk = async (cardId: string, question: string) => {
    const config = await getAIConfig();
    if (!config) {
      setShowSettings(true);
      return;
    }

    const card = cards.find((c) => c.id === cardId);
    if (!card) return;

    setAskLoading(true);
    setAskError(null);

    const requestId = ++askRequestRef.current;

    try {
      const answer = await askAboutCard(config, card, cards, question, lang);
      if (askRequestRef.current !== requestId) return;
      const exchange: AskExchange = { question, answer, createdAt: Date.now() };
      setAskExchanges((prev) => [...prev, exchange]);
      void saveAskExchange(cardId, exchange);
    } catch (err) {
      if (askRequestRef.current !== requestId) return;
      setAskError(err instanceof Error ? err.message : tr("genFail"));
    } finally {
      if (askRequestRef.current === requestId) {
        setAskLoading(false);
      }
    }
  };

  const handleAnalyzeMindset = async () => {
    const config = await getAIConfig();
    if (!config) {
      setShowSettings(true);
      return;
    }

    setMindsetLoading(true);
    setMindsetError(null);
    setMindsetResult(null);

    try {
      const result = await analyzeMindset(config, cards, lang);
      setMindsetResult(result);
    } catch (err) {
      setMindsetError(err instanceof Error ? err.message : tr("genFail"));
    } finally {
      setMindsetLoading(false);
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

  const exportCards = useCallback((format: "md" | "json", cardsToExport: Card[]) => {
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
  }, [tr]);

  const handleExport = useCallback((format: "md" | "json") => {
    exportCards(format, cards);
  }, [cards, exportCards]);

  const toggleSelection = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleExpand = useCallback((id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
    setEditingThoughtId(null);
  }, []);

  /** Jump from the revisit spotlight to the original entry in the timeline. */
  const handleJump = useCallback((id: string) => {
    setExpandedId(id);
    setEditingThoughtId(null);
    requestAnimationFrame(() => {
      document
        .getElementById(`card-${id}`)
        ?.scrollIntoView({ block: "center", behavior: "smooth" });
    });
  }, []);

  const filtered = useMemo(() => {
    if (!query) return cards;
    const q = query.toLowerCase();
    return cards.filter(
      (c) =>
        c.content.toLowerCase().includes(q) ||
        c.thought?.toLowerCase().includes(q) ||
        c.source.heading?.toLowerCase().includes(q) ||
        c.source.siteName?.toLowerCase().includes(q) ||
        c.source.author?.toLowerCase().includes(q)
    );
  }, [cards, query]);

  /** Sections grouped by calendar day, newest first. */
  const sections = useMemo(() => {
    const nowTs = Date.now();
    const todayKey = dayKey(nowTs);
    const yesterdayKey = todayKey - 86_400_000;
    const byDay = new Map<number, Card[]>();
    for (const c of filtered) {
      // Clamp future timestamps into today so they never float above it.
      const k = c.createdAt > nowTs ? todayKey : dayKey(c.createdAt);
      const bucket = byDay.get(k);
      if (bucket) bucket.push(c);
      else byDay.set(k, [c]);
    }
    return [...byDay.entries()]
      .sort((a, b) => b[0] - a[0])
      .map(([k, dayCards]) => ({
        dayTs: k,
        special:
          k === todayKey
            ? ("today" as const)
            : k === yesterdayKey
              ? ("yesterday" as const)
              : null,
        cards: dayCards,
      }));
  }, [filtered]);

  /** Masthead stats: distinct capture days and non-empty thoughts. */
  const stats = useMemo(() => {
    const days = new Set(cards.map((c) => dayKey(c.createdAt))).size;
    const thoughts = cards.filter((c) => c.thought?.trim()).length;
    return { days, thoughts };
  }, [cards]);

  /**
   * Daily revisit spotlight: deterministically resurface one entry older
   * than a week (same pick all day), once the archive has some depth.
   */
  const revisit = useMemo(() => {
    if (query || selectionMode || cards.length < 8) return null;
    const cutoff = Date.now() - 7 * 86_400_000;
    const old = cards.filter((c) => c.createdAt < cutoff);
    if (old.length === 0) return null;
    return old[Math.floor(Date.now() / 86_400_000) % old.length];
  }, [cards, query, selectionMode]);

  const toggleSelectAll = useCallback(() => {
    const allFilteredIds = new Set(filtered.map((c) => c.id));
    const allSelected =
      filtered.length > 0 && filtered.every((c) => selectedIds.has(c.id));
    setSelectedIds(allSelected ? new Set() : allFilteredIds);
  }, [filtered, selectedIds]);

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
    if (askCardId && selectedIds.has(askCardId)) {
      setAskCardId(null);
      setAskExchanges([]);
      setAskError(null);
    }
    void Promise.all(ids.map((id) => deleteAskHistory(id)));
    await deleteCards(ids);

    const payload: PendingDelete = { type: "batch", items };
    pendingDeleteRef.current = payload;
    setPendingDelete(payload);
    setSelectionMode(false);
    setSelectedIds(new Set());
    scheduleToastDismiss();
  };

  const handleBatchExport = useCallback((format: "md" | "json") => {
    const selected = cards.filter((c) => selectedIds.has(c.id));
    if (selected.length === 0) return;
    exportCards(format, selected);
    setSelectionMode(false);
    setSelectedIds(new Set());
  }, [cards, selectedIds, exportCards]);

  return (
    <div className="min-h-screen bg-paper">
      <SearchHeader
        query={query}
        canExport={cards.length > 0}
        canSelect={cards.length > 0 && !selectionMode}
        canAnalyzeMindset={cards.length > 0}
        searchRef={searchRef}
        onBack={handleBack}
        onQueryChange={setQuery}
        onClearQuery={() => { setQuery(""); searchRef.current?.focus(); }}
        onExport={handleExport}
        onStartSelection={() => setSelectionMode(true)}
        onAnalyzeMindset={() => {
          setShowMindset(true);
          setMindsetResult(null);
          setMindsetError(null);
        }}
        onOpenSettings={() => setShowSettings(true)}
        title={tr("title")}
        subtitle={tr("openJournal")}
        statsLabel={
          cards.length > 0
            ? tr("journalStats", {
                cards: cards.length,
                days: stats.days,
                thoughts: stats.thoughts,
              })
            : ""
        }
        backLabel={tr("back")}
        searchPlaceholder={tr("search")}
        exportMarkdownLabel={tr("exportMarkdown")}
        exportJSONLabel={tr("exportJSON")}
        selectLabel={tr("select")}
        settingsLabel={tr("settingsTitle")}
        analyzeMindsetLabel={tr("analyzeMindset")}
        moreLabel={tr("showMore")}
      >
        {selectionMode && (
          <SelectionBar
            filteredCount={filtered.length}
            selectedCount={selectedIds.size}
            allFilteredSelected={filtered.length > 0 && filtered.every((c) => selectedIds.has(c.id))}
            onToggleSelectAll={toggleSelectAll}
            onBatchExport={handleBatchExport}
            onBatchDelete={handleBatchDelete}
            onCancel={() => {
              setSelectionMode(false);
              setSelectedIds(new Set());
            }}
            selectAllLabel={tr("selectAll")}
            deselectAllLabel={tr("deselectAll")}
            selectedCountLabel={tr("selectedCount", { count: selectedIds.size })}
            exportMarkdownLabel={tr("exportMarkdown")}
            exportJSONLabel={tr("exportJSON")}
            batchDeleteLabel={tr("batchDelete")}
            cancelLabel={tr("cancelSelection")}
          />
        )}
      </SearchHeader>

      <main className="max-w-[768px] mx-auto px-4 sm:px-6 pt-4 pb-24 animate-[fade-up_.45s_ease-out_both]">
        {loading ? (
          <div className="mt-8">
            <Skeleton />
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            query={query}
            noMatch={tr("noMatch")}
            noCards={tr("noCards")}
            emptyDesc={tr("emptyDesc")}
            guideSteps={[tr("guideStep1"), tr("guideStep2"), tr("guideStep3")]}
          />
        ) : query ? (
          <div>
            {filtered.map((card) => (
              <CardItem
                key={card.id}
                card={card}
                query={query}
                lang={lang}
                timeLabel={formatDateTime(card.createdAt, lang)}
                expanded={expandedId === card.id}
                selected={selectedIds.has(card.id)}
                selectionMode={selectionMode}
                askOpen={askCardId === card.id}
                askExchanges={askCardId === card.id ? askExchanges : []}
                askLoading={askCardId === card.id ? askLoading : false}
                askError={askCardId === card.id ? askError : null}
                editingThoughtId={editingThoughtId}
                onToggleSelection={toggleSelection}
                onExpand={handleExpand}
                onDelete={handleDelete}
                onToggleAsk={handleToggleAskCard}
                onAsk={handleAsk}
                onSaveThought={handleSaveThought}
                onStartEditingThought={setEditingThoughtId}
                onStopEditingThought={() => setEditingThoughtId(null)}
              />
            ))}
          </div>
        ) : (
          <>
            {revisit && (
              <RevisitCard
                card={revisit}
                site={siteName(revisit.source)}
                timeAgo={formatRelativeDate(revisit.createdAt, lang)}
                title={tr("revisitTitle")}
                jumpLabel={tr("revisitJump")}
                onJump={() => handleJump(revisit.id)}
              />
            )}

            {sections.map((section) => {
              const gutter = getDayGutter(section.dayTs, lang);
              const specialLabel = section.special
                ? tr(section.special === "today" ? "groupToday" : "groupYesterday")
                : null;
              return (
                <section key={section.dayTs} className="mt-12 first:mt-2">
                  {/* Compact date header — mobile only */}
                  <div className="sm:hidden flex items-baseline gap-2">
                    {specialLabel && (
                      <span className="shrink-0 text-[12px] font-semibold text-seal">
                        {specialLabel}
                      </span>
                    )}
                    <span className="shrink-0 text-[12px] font-medium text-ink-700">
                      {formatDayLabel(section.dayTs, lang)}
                    </span>
                    <span className="text-[10px] text-ink-300 tabular-nums">
                      {section.cards.length}
                    </span>
                    <span className="h-px flex-1 self-center bg-line-soft" />
                  </div>

                  <div className="sm:grid sm:grid-cols-[72px_1fr]">
                    {/* Margin date gutter — desktop */}
                    <div className="hidden sm:block">
                      <div className="sticky top-20 pt-6 pr-5 text-right">
                        <div
                          className={`font-quote text-[26px] leading-none tabular-nums ${
                            section.special === "today" ? "text-seal" : "text-ink-800"
                          }`}
                        >
                          {gutter.day}
                        </div>
                        <div className="mt-1.5 text-[10px] tracking-wide text-ink-400">
                          {gutter.weekday}
                        </div>
                        <div className="mt-0.5 text-[10px] tracking-wide text-ink-400">
                          {gutter.month}
                        </div>
                        {gutter.year && (
                          <div className="mt-0.5 text-[10px] tracking-wide text-ink-300 tabular-nums">
                            {gutter.year}
                          </div>
                        )}
                        {specialLabel && (
                          <div className="mt-2 text-[10px] font-medium text-seal">
                            {specialLabel}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Entries */}
                    <div className="min-w-0 sm:border-l sm:border-line-soft sm:pl-7">
                      {section.cards.map((card) => (
                        <CardItem
                          key={card.id}
                          card={card}
                          query={query}
                          lang={lang}
                          timeLabel={formatTime(card.createdAt, lang)}
                          expanded={expandedId === card.id}
                          selected={selectedIds.has(card.id)}
                          selectionMode={selectionMode}
                          askOpen={askCardId === card.id}
                          askExchanges={askCardId === card.id ? askExchanges : []}
                          askLoading={askCardId === card.id ? askLoading : false}
                          askError={askCardId === card.id ? askError : null}
                          editingThoughtId={editingThoughtId}
                          onToggleSelection={toggleSelection}
                          onExpand={handleExpand}
                          onDelete={handleDelete}
                          onToggleAsk={handleToggleAskCard}
                          onAsk={handleAsk}
                          onSaveThought={handleSaveThought}
                          onStartEditingThought={setEditingThoughtId}
                          onStopEditingThought={() => setEditingThoughtId(null)}
                        />
                      ))}
                    </div>
                  </div>
                </section>
              );
            })}
          </>
        )}
      </main>

      {pendingDelete && (
        <UndoToast
          pendingDelete={pendingDelete}
          deletedToast={tr("deletedToast")}
          batchDeletedToast={tr("batchDeletedToast", { count: pendingDelete.type === "batch" ? pendingDelete.items.length : 1 })}
          undoLabel={tr("undo")}
          onUndo={handleUndoDelete}
          onMouseEnter={clearDeleteTimer}
          onMouseLeave={scheduleToastDismiss}
        />
      )}

      <MindsetModal
        open={showMindset}
        loading={mindsetLoading}
        error={mindsetError}
        analysis={mindsetResult}
        title={tr("mindsetTitle")}
        themesLabel={tr("mindsetThemes")}
        patternsLabel={tr("mindsetPatterns")}
        evolutionLabel={tr("mindsetEvolution")}
        connectionsLabel={tr("mindsetConnections")}
        loadingLabel={tr("mindsetLoading")}
        retryLabel={tr("mindsetRetry")}
        regenerateLabel={tr("mindsetRegenerate")}
        closeLabel={tr("mindsetClose")}
        emptyLabel={tr("mindsetEmpty")}
        genFail={tr("genFail")}
        onAnalyze={handleAnalyzeMindset}
        onClose={() => setShowMindset(false)}
      />

      {showSettings && (
        <SettingsModal
          lang={lang}
          onSetLang={handleSetLang}
          onSaved={() => setShowSettings(false)}
          onClose={() => setShowSettings(false)}
          settingsTitle={tr("settingsTitle")}
          settingsDesc={tr("settingsDesc")}
          cancelLabel={tr("cancel")}
        />
      )}
    </div>
  );
}
