import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { Card } from "@/lib/types";
import { updateCard, saveCard, getDeletedCards, importCards, permanentlyDeleteCard, restoreDeletedCard } from "@/lib/storage";
import {
  dayKey,
  formatTime,
  formatDateTime,
  formatDayLabel,
  getDayGutter,
  formatRelativeDate,
} from "@/lib/utils";
import {
  analyzeMindset,
  type MindsetAnalysis,
} from "@/lib/ai";
import { getLang, setLang, t, type Lang } from "@/lib/i18n";
import { siteName } from "@/lib/ui";
import { SearchHeader } from "@/components/journal/SearchHeader";
import { SelectionBar } from "@/components/journal/SelectionBar";
import { CardItem } from "@/components/journal/CardItem";
import { RevisitCard } from "@/components/journal/RevisitCard";
import { UndoToast } from "@/components/journal/UndoToast";
import { SettingsModal } from "@/components/journal/SettingsModal";
import { MindsetModal } from "@/components/journal/MindsetModal";
import { EmptyState } from "@/components/journal/EmptyState";
import { Skeleton } from "@/components/journal/Skeleton";
import { TrashModal } from "@/components/journal/TrashModal";
import {
  useJournalCards,
  useSelection,
  usePendingDelete,
  useAskState,
  useRequireAI,
} from "./hooks";

export default function App() {
  const { cards, setCards, loading } = useJournalCards();
  const {
    selectedIds,
    setSelectedIds,
    selectionMode,
    setSelectionMode,
    toggleSelection,
    clearSelection,
  } = useSelection();
  const {
    pendingDelete,
    clearDeleteTimer,
    scheduleToastDismiss,
    handleDelete,
    handleBatchDelete,
    handleUndoDelete,
  } = usePendingDelete();
  const {
    askCardId,
    askExchanges,
    askLoading,
    askError,
    resetAsk,
    handleToggleAskCard,
    handleAsk,
  } = useAskState();

  const { ensureAI, aiReady } = useRequireAI(() => setShowSettings(true));

  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "noThought" | "recent">("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingThoughtId, setEditingThoughtId] = useState<string | null>(null);
  const [showMindset, setShowMindset] = useState(false);
  const [mindsetResult, setMindsetResult] = useState<MindsetAnalysis | null>(null);
  const [mindsetLoading, setMindsetLoading] = useState(false);
  const [mindsetError, setMindsetError] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showTrash, setShowTrash] = useState(false);
  const [deletedCards, setDeletedCards] = useState<Card[]>([]);
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const [lang, setLangState] = useState<Lang>("zh");
  const searchRef = useRef<HTMLInputElement>(null);
  const importRef = useRef<HTMLInputElement>(null);

  const [revisitIndex, setRevisitIndex] = useState<number | null>(null);

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
    getLang().then(setLangState);
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
  }, [query, expandedId, editingThoughtId, showSettings, selectionMode, showMindset, setSelectedIds, setSelectionMode]);

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

  const handleSaveThought = async (id: string, thought: string) => {
    await updateCard(id, { thought });
    setCards((prev) =>
      prev.map((c) => (c.id === id ? { ...c, thought } : c))
    );
    setEditingThoughtId(null);
  };

  const handleAnalyzeMindset = async () => {
    const config = await ensureAI();
    if (!config) return;

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

  const handleSaveAnalysis = async (text: string) => {
    await saveCard({
      content: text,
      source: {
        url: chrome.runtime.getURL("journal.html"),
        title: tr("mindsetTitle"),
        siteName: "Glean",
      },
    });
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

  const openTrash = useCallback(async () => {
    setDeletedCards(await getDeletedCards());
    setShowTrash(true);
  }, []);

  const handleImportFile = useCallback(async (file: File | undefined) => {
    if (!file) return;
    try {
      const parsed: unknown = JSON.parse(await file.text());
      const payload = Array.isArray(parsed)
        ? parsed
        : parsed && typeof parsed === "object" && Array.isArray((parsed as { cards?: unknown }).cards)
          ? (parsed as { cards: unknown[] }).cards
          : null;
      if (!payload) throw new Error("invalid");
      const result = await importCards(payload);
      setImportMessage(tr("importResult", { added: result.added, updated: result.updated, skipped: result.skipped }));
    } catch {
      setImportMessage(tr("importInvalid"));
    }
  }, [tr]);

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
    const filteredByPreset = filter === "noThought"
      ? cards.filter((card) => !card.thought?.trim())
      : filter === "recent"
        ? cards.filter((card) => card.createdAt >= Date.now() - 7 * 86_400_000)
        : cards;
    if (!query) return filteredByPreset;
    const q = query.toLowerCase();
    return filteredByPreset.filter(
      (c) =>
        c.content.toLowerCase().includes(q) ||
        c.thought?.toLowerCase().includes(q) ||
        c.source.heading?.toLowerCase().includes(q) ||
        c.source.siteName?.toLowerCase().includes(q) ||
        c.source.author?.toLowerCase().includes(q)
    );
  }, [cards, query, filter]);

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
  const revisitPool = useMemo(() => {
    if (query || selectionMode || cards.length < 8) return [];
    const cutoff = Date.now() - 7 * 86_400_000;
    return cards.filter((c) => c.createdAt < cutoff);
  }, [cards, query, selectionMode]);

  const revisit = useMemo(() => {
    if (revisitPool.length === 0) return null;
    const baseIndex = Math.floor(Date.now() / 86_400_000) % revisitPool.length;
    const index = Math.min(revisitIndex ?? baseIndex, revisitPool.length - 1);
    return revisitPool[index];
  }, [revisitPool, revisitIndex]);

  const handleShuffleRevisit = useCallback(() => {
    if (revisitPool.length <= 1) return;
    setRevisitIndex((prev) => {
      const current = prev ?? Math.floor(Date.now() / 86_400_000) % revisitPool.length;
      let next = current;
      let attempts = 0;
      while (next === current && attempts < 10) {
        next = Math.floor(Math.random() * revisitPool.length);
        attempts++;
      }
      return next;
    });
  }, [revisitPool.length]);

  const toggleSelectAll = useCallback(() => {
    const allFilteredIds = new Set(filtered.map((c) => c.id));
    const allSelected =
      filtered.length > 0 && filtered.every((c) => selectedIds.has(c.id));
    setSelectedIds(allSelected ? new Set() : allFilteredIds);
  }, [filtered, selectedIds, setSelectedIds]);

  const handleBatchExport = useCallback((format: "md" | "json") => {
    const selected = cards.filter((c) => selectedIds.has(c.id));
    if (selected.length === 0) return;
    exportCards(format, selected);
    clearSelection();
  }, [cards, selectedIds, exportCards, clearSelection]);

  // Wire up delete handlers that need access to current expandedId / askCardId
  const onDelete = useCallback(
    (id: string) => {
      handleDelete(id, cards, expandedId, askCardId, setExpandedId, resetAsk);
    },
    [handleDelete, cards, expandedId, askCardId, resetAsk],
  );

  const onBatchDelete = useCallback(async () => {
    await handleBatchDelete(
      cards,
      selectedIds,
      expandedId,
      askCardId,
      setExpandedId,
      resetAsk,
      clearSelection,
    );
  }, [handleBatchDelete, cards, selectedIds, expandedId, askCardId, resetAsk, clearSelection]);

  const onToggleAsk = useCallback(
    (cardId: string) => {
      handleToggleAskCard(cardId, () => setShowSettings(true));
    },
    [handleToggleAskCard],
  );

  const onAsk = useCallback(
    (cardId: string, question: string, scope: import("@/lib/ai").AskScope) => {
      handleAsk(cardId, question, scope, cards, lang, tr("genFail"), () => setShowSettings(true));
    },
    [handleAsk, cards, lang],
  );

  return (
    <div className="min-h-screen bg-paper">
      <input
        ref={importRef}
        type="file"
        accept="application/json,.json"
        className="sr-only"
        onChange={(event) => {
          void handleImportFile(event.target.files?.[0]);
          event.currentTarget.value = "";
        }}
      />
      <SearchHeader
        query={query}
        canExport={cards.length > 0}
        canSelect={cards.length > 0 && !selectionMode}
        canAnalyzeMindset={cards.length > 0}
        aiReady={aiReady}
        searchRef={searchRef}
        onBack={handleBack}
        onQueryChange={setQuery}
        onClearQuery={() => { setQuery(""); searchRef.current?.focus(); }}
        onExport={handleExport}
        onStartSelection={() => setSelectionMode(true)}
        onAnalyzeMindset={async () => {
          const config = await ensureAI();
          if (!config) return;
          setShowMindset(true);
          setMindsetResult(null);
          setMindsetError(null);
        }}
        onOpenSettings={() => setShowSettings(true)}
        onImport={() => importRef.current?.click()}
        onOpenTrash={() => void openTrash()}
        activeFilter={filter}
        onFilterChange={setFilter}
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
        aiNotConfiguredHint={tr("aiNotConfiguredHint")}
        moreLabel={tr("showMore")}
        clearSearchLabel={tr("clearSearch")}
        importLabel={tr("importJSON")}
        trashLabel={tr("trash")}
        filterLabel={tr("filter")}
        filterOptions={{ all: tr("filterAll"), noThought: tr("filterNoThought"), recent: tr("filterRecent") }}
        resultCount={filtered.length}
        resultCountLabel={query || filter !== "all" ? tr("searchResults", { count: filtered.length }) : undefined}
      >
        {selectionMode && (
          <SelectionBar
            filteredCount={filtered.length}
            selectedCount={selectedIds.size}
            allFilteredSelected={filtered.length > 0 && filtered.every((c) => selectedIds.has(c.id))}
            onToggleSelectAll={toggleSelectAll}
            onBatchExport={handleBatchExport}
            onBatchDelete={onBatchDelete}
            onCancel={clearSelection}
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

      {importMessage && (
        <p className="mx-auto mt-3 max-w-[720px] px-6 text-xs text-ink-600" role="status">{importMessage}</p>
      )}

      <main className="max-w-[720px] mx-auto px-4 sm:px-6 pt-3 pb-24 animate-fade-up">
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
            {filtered.map((card, i) => (
              <div
                key={card.id}
                className="animate-journal-card-reveal"
                style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}
              >
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
                  onDelete={onDelete}
                  onToggleAsk={onToggleAsk}
                  onAsk={onAsk}
                  onSaveThought={handleSaveThought}
                  onStartEditingThought={setEditingThoughtId}
                  onStopEditingThought={() => setEditingThoughtId(null)}
                />
              </div>
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
                shuffleLabel={tr("revisitShuffle")}
                collapseLabel={tr("revisitCollapse")}
                expandLabel={tr("revisitExpand")}
                collapsedLabel={tr("revisitCollapsed")}
                onJump={() => handleJump(revisit.id)}
                onShuffle={revisitPool.length > 1 ? handleShuffleRevisit : undefined}
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
                      {section.cards.map((card, i) => (
                        <div
                          key={card.id}
                          className="animate-journal-card-reveal"
                          style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}
                        >
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
                            onDelete={onDelete}
                            onToggleAsk={onToggleAsk}
                            onAsk={onAsk}
                            onSaveThought={handleSaveThought}
                            onStartEditingThought={setEditingThoughtId}
                            onStopEditingThought={() => setEditingThoughtId(null)}
                          />
                        </div>
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
        saveLabel={tr("mindsetSave")}
        savedLabel={tr("saved")}
        onAnalyze={handleAnalyzeMindset}
        onClose={() => setShowMindset(false)}
        onSaveAnalysis={handleSaveAnalysis}
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
      {showTrash && (
        <TrashModal
          cards={deletedCards}
          onClose={() => setShowTrash(false)}
          onRestore={(id) => {
            void restoreDeletedCard(id).then(() => setDeletedCards((prev) => prev.filter((card) => card.id !== id)));
          }}
          onDelete={(id) => {
            void permanentlyDeleteCard(id).then(() => setDeletedCards((prev) => prev.filter((card) => card.id !== id)));
          }}
          title={tr("trash")}
          emptyLabel={tr("trashEmpty")}
          restoreLabel={tr("restore")}
          deleteLabel={tr("deletePermanently")}
          closeLabel={tr("mindsetClose")}
        />
      )}
    </div>
  );
}
