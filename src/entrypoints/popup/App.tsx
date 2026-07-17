import { useState, useEffect, useMemo, useRef } from "react";
import { Card } from "@/lib/types";
import { getCards } from "@/lib/storage";
import { ChevronRight, PenLine, Settings, ChevronLeft } from "lucide-react";
import { formatRelativeDate } from "@/lib/utils";
import { getLang, setLang, t, type Lang } from "@/lib/i18n";
import { siteColor } from "@/lib/ui";
import { LanguageControl, ThemeControl, AIConfigForm } from "@/components/AISettings";
import { SyncSettings } from "@/components/SyncSettings";

const RECENT_COUNT = 4;

export default function App() {
  const [cards, setCards] = useState<Card[]>([]);
  const [lang, setLangState] = useState<Lang>("zh");
  const [view, setView] = useState<"main" | "settings">("main");
  const [pulse, setPulse] = useState(false);
  const prevCountRef = useRef<number | null>(null);

  useEffect(() => {
    getCards().then(setCards);
    getLang().then(setLangState);

    // Sync cards when changed from content script
    const listener = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area === "local" && changes.glean_cards) {
        setCards(changes.glean_cards.newValue ?? []);
      }
    };
    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }, []);

  // Pulse the stats when a new card arrives while the popup is open
  useEffect(() => {
    if (prevCountRef.current !== null && cards.length > prevCountRef.current) {
      setPulse(true);
      const timer = setTimeout(() => setPulse(false), 550);
      return () => clearTimeout(timer);
    }
    prevCountRef.current = cards.length;
  }, [cards.length]);

  const handleSetLang = async (l: Lang) => {
    await setLang(l);
    setLangState(l);
  };

  const tr = (key: string, vars?: Record<string, string | number>) => t(key, lang, vars);

  const stats = useMemo(() => {
    const total = cards.length;
    const withThoughts = cards.filter((c) => c.thought).length;
    const today = cards.filter(
      (c) => c.createdAt > Date.now() - 86_400_000
    ).length;
    const thoughtCards = cards.filter((c) => c.thought);
    const avgThoughtLen = thoughtCards.length > 0
      ? Math.round(thoughtCards.reduce((s, c) => s + (c.thought?.length || 0), 0) / thoughtCards.length)
      : 0;
    const thoughtRate = total > 0 ? Math.round((withThoughts / total) * 100) : 0;
    return { total, withThoughts, today, avgThoughtLen, thoughtRate };
  }, [cards]);

  const recent = useMemo(() => cards.slice(0, RECENT_COUNT), [cards]);

  const openHistory = async (cardId?: string) => {
    const base = chrome.runtime.getURL("journal.html");
    const url = cardId ? `${base}#${cardId}` : base;
    const tabs = await chrome.tabs.query({ url: `${base}*` });
    if (tabs.length > 0 && tabs[0].id !== undefined) {
      chrome.tabs.update(tabs[0].id, { active: true, url });
    } else {
      chrome.tabs.create({ url });
    }
  };

  if (view === "settings") {
    return <SettingsView lang={lang} tr={tr} onBack={() => setView("main")} onSetLang={handleSetLang} />;
  }

  return (
    <div className="w-[360px] bg-paper font-sans">
      {/* Header */}
      <header className="px-5 pt-5 pb-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-baseline gap-2">
            <h1 className="font-quote text-[19px] font-semibold tracking-tight text-ink-900">
              {tr("title")}
            </h1>
            {stats.total > 0 && (
              <span className="font-quote text-[13px] text-ink-300 tabular-nums">
                {stats.total}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => openHistory()}
              className="flex items-center gap-0.5 px-2 py-1.5 text-xs text-ink-400 hover:text-seal rounded-lg transition-colors"
            >
              {tr("history")} <ChevronRight size={12} />
            </button>
            <button
              onClick={() => setView("settings")}
              className="p-1.5 text-ink-400 hover:text-ink-600 hover:bg-surface rounded-lg transition-colors"
              title={tr("settings")}
            >
              <Settings size={15} />
            </button>
          </div>
        </div>

        {/* Stats — reading-journal summary */}
        <div className="bg-surface border border-line-soft rounded-2xl px-4 py-4">
          <div className="flex items-stretch">
            {[
              { label: tr("total"), value: stats.total, pulsing: pulse },
              { label: tr("thoughts"), value: stats.withThoughts, pulsing: false },
              { label: tr("today"), value: stats.today, pulsing: pulse },
            ].map((s, i) => (
              <div
                key={s.label}
                className={`flex-1 flex flex-col items-center gap-1.5 ${i > 0 ? "border-l border-line-soft" : ""}`}
              >
                <span
                  className={`font-quote text-[22px] leading-none font-medium text-ink-900 tabular-nums ${
                    s.pulsing ? "animate-[stat-pop_.5s_ease-out]" : ""
                  }`}
                >
                  {s.value}
                </span>
                <span className="text-[10px] uppercase tracking-[0.12em] text-ink-400">
                  {s.label}
                </span>
              </div>
            ))}
          </div>
          <div className="mt-4 pt-3 border-t border-line-soft">
            <div className="flex items-baseline justify-between mb-1.5">
              <span className="text-[10px] uppercase tracking-[0.12em] text-ink-400">
                {tr("thoughtRate")}
              </span>
              <span className="font-quote text-[13px] text-seal tabular-nums">
                {stats.thoughtRate}%
              </span>
            </div>
            <div className="h-[3px] rounded-full bg-line-soft overflow-hidden">
              <div
                className="h-full rounded-full bg-seal transition-[width] duration-700 ease-out"
                style={{ width: `${stats.thoughtRate}%` }}
              />
            </div>
            {stats.withThoughts > 0 && (
              <p className="mt-2 text-right text-[10px] text-ink-300 tabular-nums">
                {stats.avgThoughtLen} {tr("avgLenUnit")}
              </p>
            )}
          </div>
        </div>
      </header>

      {/* Recent quotes */}
      {recent.length > 0 && (
        <div className="px-5 pb-5">
          <div className="flex items-center gap-2 mb-2">
            <h2 className="text-[10px] font-medium text-ink-400 uppercase tracking-[0.12em]">
              {tr("recent")}
            </h2>
            <div className="flex-1 h-px bg-line-soft" />
          </div>
          <div>
            {recent.map((card) => {
              const site = card.source.siteName || card.source.heading || card.source.url;
              return (
                <div
                  key={card.id}
                  className="group cursor-pointer py-3 -mx-2 px-2 rounded-xl hover:bg-surface transition-colors"
                  onClick={() => openHistory(card.id)}
                >
                  <p className="font-quote text-[13.5px] text-ink-900 leading-[1.75] line-clamp-2">
                    <span className="text-seal mr-0.5">“</span>
                    {card.content}
                  </p>
                  {card.thought && (
                    <div className="flex items-start gap-1.5 mt-1.5">
                      <PenLine size={11} className="text-ink-300 mt-[3px] shrink-0" />
                      <p className="font-quote italic text-[12.5px] text-ink-600 leading-relaxed line-clamp-1">
                        {card.thought}
                      </p>
                    </div>
                  )}
                  <div className="flex items-center gap-1.5 mt-2">
                    {card.source.favicon && (
                      <img
                        src={card.source.favicon}
                        alt=""
                        className="w-3 h-3 rounded-[3px] object-contain opacity-70"
                        onError={(e) =>
                          (e.currentTarget.style.display = "none")
                        }
                      />
                    )}
                    <span
                      className="text-[11px] font-medium truncate max-w-[140px]"
                      style={{ color: siteColor(site) }}
                    >
                      {site}
                    </span>
                    <span className="text-[11px] text-ink-300">·</span>
                    <span className="text-[11px] text-ink-400">
                      {formatRelativeDate(card.createdAt, lang)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {stats.total > RECENT_COUNT && (
            <button
              onClick={() => openHistory()}
              className="mt-1 w-full text-center text-[12px] text-ink-400 hover:text-seal py-2 border-t border-line-soft transition-colors"
            >
              {tr("viewAll", { count: stats.total })}
            </button>
          )}
        </div>
      )}

      {/* Empty state — teach the flow */}
      {stats.total === 0 && (
        <div className="px-5 pb-6">
          <div className="rounded-2xl border border-line-soft bg-surface px-5 py-6">
            <p className="font-quote italic text-center text-[14px] text-ink-600 leading-relaxed mb-5">
              {tr("emptyTitle1")}
              <br />
              {tr("emptyTitle2")}
            </p>
            <ol className="space-y-2.5">
              {[tr("guideStep1"), tr("guideStep2"), tr("guideStep3")].map((step, i) => (
                <li key={i} className="flex items-baseline gap-3">
                  <span className="font-quote italic text-[15px] text-seal w-4 shrink-0 text-right">
                    {i + 1}.
                  </span>
                  <span className="text-[12.5px] text-ink-600 leading-relaxed">{step}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Settings View ────────────────────────── */

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 mb-2">
      <span className="text-[10px] font-medium text-ink-400 uppercase tracking-[0.12em] shrink-0">
        {children}
      </span>
      <span className="flex-1 h-px bg-line-soft" />
    </div>
  );
}

function SettingsView({
  lang,
  tr,
  onBack,
  onSetLang,
}: {
  lang: Lang;
  tr: (key: string, vars?: Record<string, string | number>) => string;
  onBack: () => void;
  onSetLang: (l: Lang) => void;
}) {
  return (
    <div className="w-[360px] bg-paper font-sans">
      {/* Header */}
      <div className="px-5 pt-5 pb-3 flex items-center gap-2 border-b border-line-soft">
        <button
          onClick={onBack}
          className="p-1 text-ink-400 hover:text-ink-600 transition-colors"
        >
          <ChevronLeft size={18} />
        </button>
        <h1 className="font-quote text-[15px] font-semibold text-ink-900">{tr("settings")}</h1>
      </div>

      <div className="px-5 py-4 space-y-5">
        {/* ── Language ─────────────────── */}
        <section>
          <SectionLabel>{tr("langLabel")}</SectionLabel>
          <LanguageControl lang={lang} onSetLang={onSetLang} />
        </section>

        {/* ── Appearance ───────────────── */}
        <section>
          <SectionLabel>{tr("appearanceSection")}</SectionLabel>
          <ThemeControl tr={tr} />
        </section>

        {/* ── AI Provider ──────────────── */}
        <section>
          <SectionLabel>{tr("aiProvider")}</SectionLabel>
          <AIConfigForm tr={tr} framed />
        </section>

        {/* ── Cloud Sync ──────────────── */}
        <section>
          <SectionLabel>{tr("cloudSync")}</SectionLabel>
          <SyncSettings tr={tr} />
        </section>
      </div>

      {/* Footer */}
      <div className="px-5 py-3 border-t border-line-soft">
        <p className="font-quote italic text-[11px] text-ink-300 text-center">Glean</p>
      </div>
    </div>
  );
}
