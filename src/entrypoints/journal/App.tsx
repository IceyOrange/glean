import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { Card } from "@/lib/types";
import { getCards, deleteCard, deleteCards, restoreCard, updateCard } from "@/lib/storage";
import { dayGroup, type DayGroup } from "@/lib/utils";
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
import { SearchHeader } from "@/components/journal/SearchHeader";
import { SelectionBar } from "@/components/journal/SelectionBar";
import { CardItem } from "@/components/journal/CardItem";
import { UndoToast, PendingDelete } from "@/components/journal/UndoToast";
import { SettingsModal } from "@/components/journal/SettingsModal";
import { MindsetModal } from "@/components/journal/MindsetModal";
import { EmptyState } from "@/components/journal/EmptyState";
import { Skeleton } from "@/components/journal/Skeleton";

const GROUP_ORDER: { key: DayGroup; labelKey: string }[] = [
  { key: "today", labelKey: "groupToday" },
  { key: "yesterday", labelKey: "groupYesterday" },
  { key: "earlier", labelKey: "groupEarlier" },
];

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
  const [showExport, setShowExport] = useState(false);
  const [lang, setLangState] = useState<Lang>("zh");
  const [loading, setLoading] = useState(true);
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectionMode, setSelectionMode] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const exportRef = useRef<HTMLDivElement>(null);
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
        if (showMindset) {
          setShowMindset(false);
        } else if (showExport) {
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
  }, [query, expandedId, editingThoughtId, showSettings, showExport, selectionMode, showMindset]);

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
    setShowExport(false);
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

  const groups = useMemo(
    () =>
      GROUP_ORDER.map((g) => ({
        ...g,
        cards: filtered.filter((c) => dayGroup(c.createdAt) === g.key),
      })).filter((g) => g.cards.length > 0),
    [filtered]
  );

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
        cardsCount={cards.length}
        query={query}
        showExport={showExport}
        canExport={cards.length > 0}
        canSelect={cards.length > 0 && !selectionMode}
        canAnalyzeMindset={cards.length > 0}
        exportRef={exportRef}
        searchRef={searchRef}
        onBack={handleBack}
        onQueryChange={setQuery}
        onClearQuery={() => { setQuery(""); searchRef.current?.focus(); }}
        onToggleExport={() => setShowExport((v) => !v)}
        onExport={handleExport}
        onStartSelection={() => setSelectionMode(true)}
        onAnalyzeMindset={() => {
          setShowMindset(true);
          setMindsetResult(null);
          setMindsetError(null);
        }}
        onOpenSettings={() => setShowSettings(true)}
        title={tr("title")}
        backLabel={tr("back")}
        cardCountLabel={tr("cardCount", { count: cards.length })}
        searchPlaceholder={tr("search")}
        exportDataLabel={tr("exportData")}
        exportMarkdownLabel={tr("exportMarkdown")}
        exportJSONLabel={tr("exportJSON")}
        selectLabel={tr("select")}
        settingsLabel={tr("settingsTitle")}
        analyzeMindsetLabel={tr("analyzeMindset")}
      />

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

      <main className="max-w-[680px] mx-auto px-6 py-6 pb-24">
        {loading ? (
          <Skeleton />
        ) : filtered.length === 0 ? (
          <EmptyState
            query={query}
            noMatch={tr("noMatch")}
            noCards={tr("noCards")}
            emptyDesc={tr("emptyDesc")}
          />
        ) : query ? (
          <div>
            {filtered.map((card) => (
              <CardItem
                key={card.id}
                card={card}
                query={query}
                lang={lang}
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
          groups.map((g) => (
            <section key={g.key}>
              <div className="flex items-center gap-2 mt-6 mb-1 first:mt-0">
                <h2 className="text-[10px] font-medium uppercase tracking-[0.12em] text-ink-400">
                  {tr(g.labelKey)}
                </h2>
                <div className="flex-1 h-px bg-line-soft" />
              </div>
              <div>
                {g.cards.map((card) => (
                  <CardItem
                    key={card.id}
                    card={card}
                    query={query}
                    lang={lang}
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
            </section>
          ))
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
          langLabel={tr("langLabel")}
          themeLabel={tr("themeLabel")}
          cancelLabel={tr("cancel")}
        />
      )}
    </div>
  );
}
