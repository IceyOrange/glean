import { useState, useEffect, useMemo, useRef } from "react";
import { Card } from "@/lib/types";
import { getCards } from "@/lib/storage";
import { BookOpen, PenLine, Settings, ChevronLeft } from "lucide-react";
import { formatRelativeDate } from "@/lib/utils";
import { getLang, setLang, t, type Lang } from "@/lib/i18n";
import { siteColor } from "@/lib/ui";
import { SettingsPanel } from "@/components/SettingsPanel";

const RECENT_COUNT = 4;
const VIEW_TRANSITION_MS = 250; // matches .animate-slide-in-* (240ms) in tailwind.css

export default function App() {
  const [cards, setCards] = useState<Card[]>([]);
  const [cardsLoading, setCardsLoading] = useState(true);
  const [lang, setLangState] = useState<Lang>("zh");
  const [view, setView] = useState<"main" | "settings">("main");
  const [exitingView, setExitingView] = useState<"main" | "settings" | null>(null);
  const [transitionLocked, setTransitionLocked] = useState(false);
  const [themeTransitionReady, setThemeTransitionReady] = useState(false);
  const transitionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    getCards().then((loaded) => {
      setCards(loaded);
      setCardsLoading(false);
    });
    getLang().then(setLangState);

    // Enable theme transitions after the first paint to avoid initial-load flash.
    const raf = requestAnimationFrame(() => setThemeTransitionReady(true));

    // Sync cards when changed from content script
    const listener = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area === "local" && changes.glean_cards) {
        setCards(changes.glean_cards.newValue ?? []);
      }
    };
    chrome.storage.onChanged.addListener(listener);
    return () => {
      chrome.storage.onChanged.removeListener(listener);
      cancelAnimationFrame(raf);
      if (transitionTimerRef.current) clearTimeout(transitionTimerRef.current);
    };
  }, []);

  const handleSetLang = async (l: Lang) => {
    await setLang(l);
    setLangState(l);
  };

  const tr = (key: string, vars?: Record<string, string | number>) => t(key, lang, vars);

  const switchView = (target: "main" | "settings") => {
    if (target === view || transitionLocked) return;
    setTransitionLocked(true);
    setExitingView(view);
    setView(target);
    transitionTimerRef.current = setTimeout(() => {
      setExitingView(null);
      setTransitionLocked(false);
    }, VIEW_TRANSITION_MS);
  };

  const stats = useMemo(() => {
    const total = cards.length;
    return { total };
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

  const rootTransition = themeTransitionReady ? "transition-colors duration-200 ease-out-quart" : "";

  const mainContent = (
    <div className={`w-[360px] bg-paper font-sans ${rootTransition}`}>
      {/* Header */}
      <header className="px-5 pt-5 pb-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-baseline gap-2.5">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-seal" />
              <h1 className="font-quote text-[19px] font-semibold tracking-tight text-ink-900">
                {tr("title")}
              </h1>
            </div>
            {!cardsLoading && stats.total > 0 && (
              <span className="font-quote text-[13px] text-ink-500 tabular-nums">{stats.total}</span>
            )}
          </div>
          <button
            onClick={() => switchView("settings")}
            disabled={transitionLocked}
            className="p-1.5 text-ink-400 hover:text-ink-700 hover:bg-surface active:bg-line-soft active:scale-[0.97] rounded-lg transition-all duration-200 ease-out-quint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-seal/50 focus-visible:ring-offset-2 focus-visible:ring-offset-paper disabled:opacity-50"
            title={tr("settings")}
            aria-label={tr("settings")}
          >
            <Settings size={15} />
          </button>
        </div>

        {!cardsLoading && (
          <p className="-mt-1 text-[11px] text-ink-500">
            {tr("popupCards", { count: stats.total })}
          </p>
        )}

        <button
          onClick={() => openHistory()}
          className="mt-3 w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-ink-900 text-paper text-[13px] font-medium rounded-xl hover:bg-ink-800 active:bg-ink-700 active:scale-[0.97] transition-all duration-200 ease-out-quint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-seal/50 focus-visible:ring-offset-2 focus-visible:ring-offset-paper"
        >
          <BookOpen size={15} />
          {tr("openJournal")}
        </button>
      </header>

      {/* Recent quotes */}
      {recent.length > 0 && !cardsLoading && (
        <div className="px-5 pb-5">
          <div className="flex items-center gap-2 mb-2">
            <h2 className="text-[10px] font-medium text-ink-400 uppercase tracking-[0.12em]">{tr("recent")}</h2>
            <div className="flex-1 h-px bg-line-soft" />
          </div>
          <div>
            {recent.map((card) => {
              const site = card.source.siteName || card.source.heading || card.source.url;
              return (
                <div
                  key={card.id}
                  className="group cursor-pointer py-3 -mx-2 px-2 rounded-xl hover:bg-surface active:bg-line-soft/60 active:scale-[0.99] transition-all duration-200 ease-out-quint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-seal/40 focus-visible:ring-offset-2 focus-visible:ring-offset-paper"
                  onClick={() => openHistory(card.id)}
                  tabIndex={0}
                  role="button"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      openHistory(card.id);
                    }
                  }}
                >
                  <p className="font-quote text-[13.5px] text-ink-900 leading-[1.75] line-clamp-2">
                    <span className="text-seal mr-0.5">“</span>
                    {card.content}
                  </p>
                  {card.thought && (
                    <div className="flex items-start gap-1.5 mt-1.5">
                      <PenLine size={11} className="text-ink-300 mt-[3px] shrink-0" />
                      <p className="font-quote italic text-[12.5px] text-ink-600 leading-relaxed line-clamp-1">{card.thought}</p>
                    </div>
                  )}
                  <div className="flex items-center gap-1.5 mt-2">
                    {card.source.favicon && (
                      <img
                        src={card.source.favicon}
                        alt=""
                        className="w-3 h-3 rounded-[3px] object-contain opacity-70"
                        onError={(e) => (e.currentTarget.style.display = "none")}
                      />
                    )}
                    <span
                      className="text-[11px] font-medium truncate max-w-[140px]"
                      style={{ color: siteColor(site) }}
                    >
                      {site}
                    </span>
                    <span className="text-[11px] text-ink-300">·</span>
                    <span className="text-[11px] text-ink-500">{formatRelativeDate(card.createdAt, lang)}</span>
                  </div>
                </div>
              );
            })}
          </div>

          {stats.total > RECENT_COUNT && (
            <button
              onClick={() => openHistory()}
              className="mt-1 w-full text-center text-[12px] text-ink-500 hover:text-seal py-2 border-t border-line-soft transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-seal/40 focus-visible:ring-offset-2 focus-visible:ring-offset-paper rounded-lg"
            >
              {tr("viewAll", { count: stats.total })}
            </button>
          )}
        </div>
      )}

      {/* Empty state — teach the flow */}
      {!cardsLoading && stats.total === 0 && (
        <div className="px-5 pb-6">
          <div className="rounded-2xl border border-line-soft bg-surface px-5 py-6 shadow-sm transition-colors duration-200">
            <p className="font-quote italic text-center text-[14px] text-ink-600 leading-relaxed mb-5">
              {tr("emptyTitle1")}
              <br />
              {tr("emptyTitle2")}
            </p>
            <ol className="space-y-2.5">
              {[tr("guideStep1"), tr("guideStep2"), tr("guideStep3")].map((step, i) => (
                <li key={i} className="flex items-baseline gap-3">
                  <span className="font-quote italic text-[15px] text-seal w-4 shrink-0 text-right">{i + 1}.</span>
                  <span className="text-[12.5px] text-ink-600 leading-relaxed">{step}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      )}
    </div>
  );

  const settingsContent = (
    <div className={`w-[360px] bg-paper font-sans ${rootTransition}`}>
      {/* Header */}
      <div className="px-5 pt-5 pb-3 flex items-center gap-2 border-b border-line-soft bg-paper/80 backdrop-blur-sm sticky top-0 z-10 transition-colors duration-200">
        <button
          onClick={() => switchView("main")}
          disabled={transitionLocked}
          className="p-1 text-ink-400 hover:text-ink-700 hover:bg-surface active:bg-line-soft active:scale-[0.97] rounded-lg transition-all duration-200 ease-out-quint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-seal/50 focus-visible:ring-offset-2 focus-visible:ring-offset-paper disabled:opacity-50"
          aria-label={tr("back")}
        >
          <ChevronLeft size={18} />
        </button>
        <h1 className="font-quote text-[15px] font-semibold text-ink-900">{tr("settings")}</h1>
      </div>

      <div className="px-5 py-4">
        <SettingsPanel lang={lang} tr={tr} onSetLang={handleSetLang} />
      </div>

      {/* Footer */}
      <div className="px-5 py-3 border-t border-line-soft transition-colors duration-200">
        <p className="font-quote italic text-[11px] text-ink-400 text-center">Glean — {tr("settingsDesc")}</p>
      </div>
    </div>
  );

  // View switcher: current view renders normally; exiting view overlays with slide-out.
  const isForward = view === "settings";
  const currentAnimation = isForward ? "animate-slide-in-right" : "animate-slide-in-left";
  const exitingAnimation = exitingView === "main" ? "animate-slide-out-left" : "animate-slide-out-right";

  return (
    <div className="w-[360px] relative isolate overflow-hidden">
      <div className={currentAnimation} key={view}>
        {view === "main" ? mainContent : settingsContent}
      </div>
      {exitingView && (
        <div className={`absolute inset-0 ${exitingAnimation}`} key={`exit-${exitingView}`}>
          {exitingView === "main" ? mainContent : settingsContent}
        </div>
      )}
    </div>
  );
}
