import { useEffect, useState } from "react";
import { Cloud, Check, AlertCircle, Loader2, ChevronDown, ExternalLink, Search } from "lucide-react";
import {
  SyncProvider,
  SavedSyncConfig,
  ProviderConfig,
  NotionConfig,
  WebDAVConfig,
  GistConfig,
  SyncResult,
  isNotionConfig,
  isWebDAVConfig,
  isGistConfig,
  getSyncConfig,
  saveSyncConfig,
  makeDefaultConfig,
  getProviderMeta,
  getAdapter,
  requestSync,
  syncPermissionUrl,
  isWebDAVProvider,
  searchDatabases,
  searchGists,
} from "@/lib/sync";
import { ensureOriginPermission } from "@/lib/permissions";
import { Switch } from "@/components/SettingsPanel";

interface SyncSettingsProps {
  tr: (key: string, vars?: Record<string, string | number>) => string;
}

const PROVIDERS: SyncProvider[] = ["notion", "nutstore", "webdav", "gist"];

function formatTime(timestamp: number | undefined, tr: SyncSettingsProps["tr"]) {
  if (!timestamp) return tr("syncNever");
  return new Date(timestamp).toLocaleString();
}

export function SyncSettings({ tr }: SyncSettingsProps) {
  const [config, setConfig] = useState<SavedSyncConfig | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SyncResult | null>(null);
  // Notion database search state
  const [dbSearchLoading, setDbSearchLoading] = useState(false);
  const [dbSearchResults, setDbSearchResults] = useState<Array<{ id: string; title: string }>>([]);
  const [dbSearchError, setDbSearchError] = useState<string | null>(null);
  const [showGuide, setShowGuide] = useState(false);
  const [manualDbId, setManualDbId] = useState(false);
  // Gist search state
  const [gistSearchLoading, setGistSearchLoading] = useState(false);
  const [gistSearchResults, setGistSearchResults] = useState<Array<{ id: string; title: string }>>([]);
  const [gistSearchError, setGistSearchError] = useState<string | null>(null);
  const [showGistGuide, setShowGistGuide] = useState(false);
  const [manualGistId, setManualGistId] = useState(false);

  useEffect(() => {
    // `prev ?? saved`: if the user already started typing/pasting before the
    // (PBKDF2-slow) load resolved, keep their edit instead of clobbering it.
    getSyncConfig().then((saved) => {
      if (saved) setConfig((prev) => prev ?? saved);
    });
  }, []);

  // Create or clear the periodic sync alarm whenever the user toggles sync.
  useEffect(() => {
    if (config?.enabled) {
      chrome.alarms.create("glean-sync", { periodInMinutes: 60 });
    } else {
      chrome.alarms.clear("glean-sync");
    }
  }, [config?.enabled]);

  const makeFallback = (): SavedSyncConfig => ({
    provider: "notion",
    enabled: false,
    config: makeDefaultConfig("notion"),
    providerConfigs: {},
  });

  const updateConfig = (patch: Partial<SavedSyncConfig>) => {
    setResult(null);
    setConfig((prev) => {
      const next = { ...(prev ?? makeFallback()), ...patch };
      void saveSyncConfig(next);
      return next;
    });
  };

  const updateProviderConfig = (
    patch: Partial<Omit<NotionConfig, "provider">> | Partial<Omit<WebDAVConfig, "provider">> | Partial<Omit<GistConfig, "provider">>
  ) => {
    setResult(null);
    setConfig((prev) => {
      // Never drop edits while the saved config is still loading (prev ===
      // null) — a controlled input whose onChange is dropped looks exactly
      // like "paste is blocked".
      const base = prev ?? makeFallback();
      const newConfig = { ...base.config, ...patch } as ProviderConfig;
      const next = {
        ...base,
        config: newConfig,
        providerConfigs: { ...base.providerConfigs, [base.provider]: newConfig },
      };
      void saveSyncConfig(next);
      return next;
    });
  };

  const handleProviderChange = (newProvider: SyncProvider) => {
    setConfig((prev) => {
      const base = prev ?? makeFallback();
      // Save current provider's config into the map
      const updatedConfigs = { ...base.providerConfigs, [base.provider]: base.config };
      // Restore target provider's saved config, or use defaults
      const newConfig = updatedConfigs[newProvider] ?? makeDefaultConfig(newProvider);
      const next = { ...base, provider: newProvider, config: newConfig, providerConfigs: updatedConfigs };
      void saveSyncConfig(next);
      return next;
    });
    // Reset search state when switching providers
    setDbSearchResults([]);
    setDbSearchError(null);
    setManualDbId(false);
    setGistSearchResults([]);
    setGistSearchError(null);
    setManualGistId(false);
  };

  const handleSync = async () => {
    if (!config) return;
    const adapter = getAdapter(config.provider);
    const error = adapter.validate(config.config);
    if (error) {
      setResult({ ok: false, error: tr("syncConfigIncomplete") });
      return;
    }

    if (!(await ensureOriginPermission(syncPermissionUrl(config.config)))) {
      setResult({ ok: false, error: tr("permissionDenied") });
      return;
    }

    setLoading(true);
    setResult(null);
    try {
      const res = await requestSync();
      setResult(res);

      // Refresh saved config to pick up lastSyncAt / lastError.
      const saved = await getSyncConfig();
      if (saved) setConfig(saved);
    } catch {
      setResult({ ok: false, error: tr("syncUnexpectedError") });
    } finally {
      setLoading(false);
    }
  };

  const handleSearchDatabases = async () => {
    if (!isNotionConfig(providerConfig)) return;
    const token = providerConfig.token?.trim();
    if (!token) return;
    if (!(await ensureOriginPermission("https://api.notion.com"))) {
      setDbSearchError(tr("permissionDenied"));
      return;
    }
    setDbSearchLoading(true);
    setDbSearchError(null);
    setManualDbId(false);
    try {
      const dbs = await searchDatabases(token);
      setDbSearchResults(dbs);
      if (dbs.length === 0) {
        setDbSearchError(tr("syncNotionSearchFail"));
      }
    } catch {
      setDbSearchError(tr("syncNotionSearchFail"));
      setDbSearchResults([]);
    } finally {
      setDbSearchLoading(false);
    }
  };

  const handleSearchGists = async () => {
    if (!isGistConfig(providerConfig)) return;
    const token = providerConfig.token?.trim();
    if (!token) return;
    if (!(await ensureOriginPermission("https://api.github.com"))) {
      setGistSearchError(tr("permissionDenied"));
      return;
    }
    setGistSearchLoading(true);
    setGistSearchError(null);
    setManualGistId(false);
    try {
      const gists = await searchGists(token);
      setGistSearchResults(gists);
      if (gists.length === 0) {
        setGistSearchError(tr("syncGistSearchFail"));
      }
    } catch {
      setGistSearchError(tr("syncGistSearchFail"));
      setGistSearchResults([]);
    } finally {
      setGistSearchLoading(false);
    }
  };

  const provider = config?.provider ?? "notion";
  const providerConfig = config?.config ?? makeDefaultConfig(provider);
  const meta = getProviderMeta(provider);

  // Auto-search as soon as a token is present — the dropdown should just
  // appear, without a manual "搜索数据库 / 搜索 Gist" click. Debounced so
  // typing a token doesn't fire one request per keystroke. A failed search
  // is NOT auto-retried (the manual button remains as the retry path);
  // changing the token clears results+error and re-arms the effect.
  useEffect(() => {
    if (provider === "notion" && isNotionConfig(providerConfig)) {
      if (!providerConfig.token?.trim()) return;
      if (dbSearchLoading || dbSearchResults.length > 0 || dbSearchError) return;
      const timer = setTimeout(() => void handleSearchDatabases(), 800);
      return () => clearTimeout(timer);
    }
    if (provider === "gist" && isGistConfig(providerConfig)) {
      if (!providerConfig.token?.trim()) return;
      if (gistSearchLoading || gistSearchResults.length > 0 || gistSearchError) return;
      const timer = setTimeout(() => void handleSearchGists(), 800);
      return () => clearTimeout(timer);
    }
  }, [provider, providerConfig, dbSearchLoading, dbSearchResults.length, dbSearchError, gistSearchLoading, gistSearchResults.length, gistSearchError]);

  const inputCls =
    "w-full px-3 py-2 text-sm bg-surface rounded-lg border border-line outline-none transition-[border-color,box-shadow] duration-200 hover:border-ink-300/40 focus:border-seal/50 focus:ring-[3px] focus:ring-seal/15 placeholder:text-ink-300 text-ink-900 appearance-none";

  const selectCls = `${inputCls} pr-8 py-1.5 text-xs`;

  const actionBtnBase =
    "flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-[color,background-color,border-color,transform,opacity] duration-200 ease-out-quint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-seal/40 focus-visible:ring-offset-2 focus-visible:ring-offset-paper active:scale-[0.97] disabled:opacity-50 disabled:cursor-not-allowed";

  const notionToken = isNotionConfig(providerConfig) ? providerConfig.token : "";
  const notionDbId = isNotionConfig(providerConfig) ? (providerConfig.databaseId ?? "") : "";

  const gistToken = isGistConfig(providerConfig) ? providerConfig.token : "";
  const gistId = isGistConfig(providerConfig) ? (providerConfig.gistId ?? "") : "";
  const gistFilename = isGistConfig(providerConfig) ? providerConfig.filename : "glean-backup.json";

  return (
    <div className="space-y-4">
      {/* Provider selector */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-ink-600">
          <Cloud size={14} />
          <label htmlFor="sync-provider" className="text-xs font-medium">{tr("syncProvider")}</label>
        </div>
        <div className="relative w-44">
          <select
            id="sync-provider"
            value={provider}
            onChange={(e) => handleProviderChange(e.target.value as SyncProvider)}
            className={selectCls}
          >
            {PROVIDERS.map((p) => (
              <option key={p} value={p}>
                {tr(getProviderMeta(p).labelKey)}
              </option>
            ))}
          </select>
          <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-400 pointer-events-none" />
        </div>
      </div>

      <p className="text-[11px] text-ink-500 leading-relaxed">{tr(meta.descriptionKey)}</p>

      {/* ─── Notion config ─── */}
      {provider === "notion" && (
        <div className="space-y-3">
          {/* Setup wizard — three linear steps */}
          <div className="bg-paper border border-line-soft rounded-xl p-3 space-y-2 transition-colors duration-200">
            <button
              type="button"
              onClick={() => setShowGuide((v) => !v)}
              className="flex items-center gap-1 w-full text-left group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-seal/40 focus-visible:ring-offset-2 focus-visible:ring-offset-paper rounded-lg"
              aria-expanded={showGuide}
            >
              <span className="text-[11px] font-medium text-ink-600">{tr("syncNotionGuide")}</span>
              <ChevronDown
                size={12}
                className={`text-ink-400 transition-transform duration-200 ease-out-quint ${showGuide ? "rotate-0" : "-rotate-90"}`}
              />
            </button>
            {showGuide && (
              <div className="space-y-2.5 animate-status-pop">
                <ol className="space-y-2" aria-label={tr("syncNotionGuide")}>
                  <li className="grid grid-cols-[16px_1fr] gap-2">
                    <span className="pt-px text-[10px] font-semibold tabular-nums text-seal" aria-hidden="true">1</span>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                        <p className="text-[11px] font-medium text-ink-700">{tr("syncNotionCreateIntegration")}</p>
                        <a
                          href="https://www.notion.so/my-integrations/new"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 rounded-sm text-[10px] font-medium text-seal hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-seal/40"
                        >
                          {tr("syncNotionOpenIntegration")}
                          <ExternalLink size={10} aria-hidden="true" />
                        </a>
                      </div>
                      <p className="mt-0.5 text-[10px] leading-relaxed text-ink-400">{tr("syncNotionCreateIntegrationHint")}</p>
                    </div>
                  </li>
                  <li className="grid grid-cols-[16px_1fr] gap-2">
                    <span className="pt-px text-[10px] font-semibold tabular-nums text-seal" aria-hidden="true">2</span>
                    <div className="min-w-0">
                      <p className="text-[11px] font-medium text-ink-700">{tr("syncNotionCopyToken")}</p>
                      <p className="mt-0.5 text-[10px] leading-relaxed text-ink-400">{tr("syncNotionCopyTokenHint")}</p>
                    </div>
                  </li>
                  <li className="grid grid-cols-[16px_1fr] gap-2">
                    <span className="pt-px text-[10px] font-semibold tabular-nums text-seal" aria-hidden="true">3</span>
                    <div className="min-w-0">
                      <p className="text-[11px] font-medium text-ink-700">{tr("syncNotionSelectDbStep")}</p>
                      <p className="mt-0.5 text-[10px] leading-relaxed text-ink-400">{tr("syncNotionConnectDbHint")}</p>
                    </div>
                  </li>
                </ol>
                <a
                  href="https://developers.notion.com/guides/get-started/internal-connections"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 rounded-sm text-[10px] text-ink-400 hover:text-ink-600 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-seal/40"
                >
                  {tr("syncNotionOfficialGuide")}
                  <ExternalLink size={10} aria-hidden="true" />
                </a>
              </div>
            )}
          </div>

          {/* Token input */}
          <div>
            <label htmlFor="sync-notion-token" className="block text-xs text-ink-600 mb-1.5">{tr("syncToken")}</label>
            <input
              id="sync-notion-token"
              type="password"
              value={notionToken}
              onChange={(e) => {
                updateProviderConfig({ token: e.target.value });
                // Reset search when token changes
                setDbSearchResults([]);
                setDbSearchError(null);
              }}
              placeholder="secret_..."
              autoComplete="off"
              spellCheck={false}
              aria-describedby="sync-notion-token-hint"
              className={inputCls}
            />
            <p id="sync-notion-token-hint" className="mt-1.5 text-[10px] leading-relaxed text-ink-400">
              {tr("syncNotionTokenHint")}
            </p>
          </div>

          {/* Database selection */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label htmlFor="sync-notion-db" className="text-xs text-ink-600">{tr("syncDatabaseId")}</label>
              {notionToken.trim() && (
                <button
                  type="button"
                  onClick={handleSearchDatabases}
                  disabled={dbSearchLoading}
                  className="flex items-center gap-1 text-[10px] font-medium text-seal hover:text-seal/80 hover:underline disabled:opacity-50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-seal/40 focus-visible:ring-offset-1 focus-visible:ring-offset-paper rounded-sm"
                >
                  {dbSearchLoading ? <Loader2 size={10} className="animate-spin" /> : <Search size={10} />}
                  {tr("syncNotionSearchDb")}
                </button>
              )}
            </div>

            {/* Database dropdown or manual input */}
            {dbSearchResults.length > 0 && !manualDbId ? (
              <div className="space-y-1.5">
                <select
                  id="sync-notion-db"
                  value={notionDbId}
                  onChange={(e) => updateProviderConfig({ databaseId: e.target.value || undefined })}
                  className={inputCls}
                >
                  <option value="">{tr("syncNotionSelectDb")}</option>
                  {dbSearchResults.map((db) => (
                    <option key={db.id} value={db.id}>
                      {db.title}
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => setManualDbId(true)}
                  className="text-[10px] text-ink-400 hover:text-ink-600 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-seal/40 focus-visible:ring-offset-1 focus-visible:ring-offset-paper rounded-sm"
                >
                  {tr("syncNotionManualId")}
                </button>
              </div>
            ) : (
              <div className="space-y-1">
                <input
                  id="sync-notion-db"
                  type="text"
                  value={notionDbId}
                  onChange={(e) => updateProviderConfig({ databaseId: e.target.value || undefined })}
                  placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                  className={inputCls}
                />
                {dbSearchResults.length > 0 && manualDbId && (
                  <button
                    onClick={() => setManualDbId(false)}
                    className="text-[10px] font-medium text-seal hover:text-seal/80 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-seal/40 focus-visible:ring-offset-1 focus-visible:ring-offset-paper rounded-sm"
                  >
                    {tr("syncNotionSearchDb")}
                  </button>
                )}
              </div>
            )}

            {dbSearchLoading && (
              <p className="text-[10px] text-ink-400 mt-1.5 animate-status-pop" role="status">{tr("syncNotionSearchingDb")}</p>
            )}
            {dbSearchError && (
              <p className="text-[10px] text-seal mt-1.5 animate-status-pop" role="alert">{dbSearchError}</p>
            )}
            {!notionDbId && !dbSearchLoading && (
              <p className="text-[10px] text-ink-400 mt-1.5">{tr("syncNotionDbAutoHint")}</p>
            )}
          </div>
        </div>
      )}

      {/* ─── GitHub Gist config ─── */}
      {provider === "gist" && isGistConfig(providerConfig) && (
        <div className="space-y-3">
          {/* Setup wizard — three linear steps */}
          <div className="bg-paper border border-line-soft rounded-xl p-3 space-y-2 transition-colors duration-200">
            <button
              type="button"
              onClick={() => setShowGistGuide((value) => !value)}
              className="flex items-center gap-1 w-full text-left group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-seal/40 focus-visible:ring-offset-2 focus-visible:ring-offset-paper rounded-lg"
              aria-expanded={showGistGuide}
            >
              <span className="text-[11px] font-medium text-ink-600">{tr("syncGistGuide")}</span>
              <ChevronDown
                size={12}
                className={`text-ink-400 transition-transform duration-200 ease-out-quint ${showGistGuide ? "rotate-0" : "-rotate-90"}`}
              />
            </button>
            {showGistGuide && (
              <div className="space-y-2.5 animate-status-pop">
                <ol className="space-y-2" aria-label={tr("syncGistGuide")}>
                  <li className="grid grid-cols-[16px_1fr] gap-2">
                    <span className="pt-px text-[10px] font-semibold tabular-nums text-seal" aria-hidden="true">1</span>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                        <p className="text-[11px] font-medium text-ink-700">{tr("syncGistCreateToken")}</p>
                        <a
                          href="https://github.com/settings/personal-access-tokens/new?name=Glean+Sync&amp;description=Sync+Glean+cards+to+a+private+Gist&amp;gists=write"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 rounded-sm text-[10px] font-medium text-seal hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-seal/40"
                        >
                          {tr("syncGistOpenToken")}
                          <ExternalLink size={10} aria-hidden="true" />
                        </a>
                      </div>
                      <p className="mt-0.5 text-[10px] leading-relaxed text-ink-400">{tr("syncGistCreateTokenHint")}</p>
                    </div>
                  </li>
                  <li className="grid grid-cols-[16px_1fr] gap-2">
                    <span className="pt-px text-[10px] font-semibold tabular-nums text-seal" aria-hidden="true">2</span>
                    <div className="min-w-0">
                      <p className="text-[11px] font-medium text-ink-700">{tr("syncGistCopyToken")}</p>
                      <p className="mt-0.5 text-[10px] leading-relaxed text-ink-400">{tr("syncGistCopyTokenHint")}</p>
                    </div>
                  </li>
                  <li className="grid grid-cols-[16px_1fr] gap-2">
                    <span className="pt-px text-[10px] font-semibold tabular-nums text-seal" aria-hidden="true">3</span>
                    <div className="min-w-0">
                      <p className="text-[11px] font-medium text-ink-700">{tr("syncGistSelectGist")}</p>
                      <p className="mt-0.5 text-[10px] leading-relaxed text-ink-400">{tr("syncGistSelectGistHint")}</p>
                    </div>
                  </li>
                </ol>
                <a
                  href="https://docs.github.com/en/rest/gists/gists"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 rounded-sm text-[10px] text-ink-400 hover:text-ink-600 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-seal/40"
                >
                  {tr("syncGistOfficialGuide")}
                  <ExternalLink size={10} aria-hidden="true" />
                </a>
              </div>
            )}
          </div>

          {/* Token input */}
          <div>
            <label htmlFor="sync-gist-token" className="block text-xs text-ink-600 mb-1.5">{tr("syncGistToken")}</label>
            <input
              id="sync-gist-token"
              type="password"
              value={gistToken}
              onChange={(e) => {
                updateProviderConfig({ token: e.target.value });
                setGistSearchResults([]);
                setGistSearchError(null);
              }}
              placeholder="github_pat_…"
              autoComplete="off"
              spellCheck={false}
              aria-describedby="sync-gist-token-hint"
              className={inputCls}
            />
            <p id="sync-gist-token-hint" className="mt-1.5 text-[10px] leading-relaxed text-ink-400">
              {tr("syncGistTokenHint")}
            </p>
          </div>

          {/* Gist selection */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label htmlFor="sync-gist-id" className="text-xs text-ink-600">{tr("syncGistSelectGist")}</label>
              {gistToken.trim() && (
                <button
                  onClick={handleSearchGists}
                  disabled={gistSearchLoading}
                  className="flex items-center gap-1 text-[10px] font-medium text-seal hover:text-seal/80 hover:underline disabled:opacity-50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-seal/40 focus-visible:ring-offset-1 focus-visible:ring-offset-paper rounded-sm"
                >
                  {gistSearchLoading ? <Loader2 size={10} className="animate-spin" /> : <Search size={10} />}
                  {tr("syncGistSearchGist")}
                </button>
              )}
            </div>

            {gistSearchResults.length > 0 && !manualGistId ? (
              <div className="space-y-1.5">
                <select
                  id="sync-gist-id"
                  value={gistId}
                  onChange={(e) => updateProviderConfig({ gistId: e.target.value || undefined })}
                  className={inputCls}
                >
                  <option value="">{tr("syncGistSelectGistPlaceholder")}</option>
                  {gistSearchResults.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.title}
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => setManualGistId(true)}
                  className="text-[10px] text-ink-400 hover:text-ink-600 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-seal/40 focus-visible:ring-offset-1 focus-visible:ring-offset-paper rounded-sm"
                >
                  {tr("syncGistManualId")}
                </button>
              </div>
            ) : (
              <div className="space-y-1">
                <input
                  id="sync-gist-id"
                  type="text"
                  value={gistId}
                  onChange={(e) => updateProviderConfig({ gistId: e.target.value || undefined })}
                  placeholder={tr("syncGistIdPlaceholder")}
                  className={inputCls}
                />
                {gistSearchResults.length > 0 && manualGistId && (
                  <button
                    onClick={() => setManualGistId(false)}
                    className="text-[10px] font-medium text-seal hover:text-seal/80 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-seal/40 focus-visible:ring-offset-1 focus-visible:ring-offset-paper rounded-sm"
                  >
                    {tr("syncGistSearchGist")}
                  </button>
                )}
              </div>
            )}

            {gistSearchLoading && (
              <p role="status" className="text-[10px] text-ink-400 mt-1.5 animate-status-pop">{tr("syncGistSearching")}</p>
            )}
            {gistSearchError && (
              <p role="alert" className="text-[10px] text-seal mt-1.5 animate-status-pop">{gistSearchError}</p>
            )}
            {!gistId && (
              <p className="text-[10px] text-ink-400 mt-1.5">{tr("syncGistAutoCreate")}</p>
            )}
          </div>

          {/* Filename */}
          <div>
            <label htmlFor="sync-gist-filename" className="block text-xs text-ink-600 mb-1.5">{tr("syncGistFilename")}</label>
            <input
              id="sync-gist-filename"
              type="text"
              value={gistFilename}
              onChange={(e) => updateProviderConfig({ filename: e.target.value })}
              className={inputCls}
            />
          </div>
        </div>
      )}

      {/* ─── WebDAV config ─── */}
      {isWebDAVProvider(provider) && isWebDAVConfig(providerConfig) && (
        <div className="space-y-3">
          <div>
            <label htmlFor="sync-webdav-url" className="block text-xs text-ink-600 mb-1.5">{tr("syncServerUrl")}</label>
            <input
              id="sync-webdav-url"
              type="url"
              value={providerConfig.serverUrl}
              onChange={(e) => updateProviderConfig({ serverUrl: e.target.value })}
              className={inputCls}
            />
          </div>
          <div>
            <label htmlFor="sync-webdav-user" className="block text-xs text-ink-600 mb-1.5">{tr("syncUsername")}</label>
            <input
              id="sync-webdav-user"
              type="text"
              value={providerConfig.username}
              onChange={(e) => updateProviderConfig({ username: e.target.value })}
              className={inputCls}
            />
          </div>
          <div>
            <label htmlFor="sync-webdav-password" className="block text-xs text-ink-600 mb-1.5">{tr("syncPassword")}</label>
            <input
              id="sync-webdav-password"
              type="password"
              value={providerConfig.password}
              onChange={(e) => updateProviderConfig({ password: e.target.value })}
              className={inputCls}
            />
          </div>
          <div>
            <label htmlFor="sync-webdav-path" className="block text-xs text-ink-600 mb-1.5">{tr("syncRemotePath")}</label>
            <input
              id="sync-webdav-path"
              type="text"
              value={providerConfig.remotePath}
              onChange={(e) => updateProviderConfig({ remotePath: e.target.value })}
              className={inputCls}
            />
          </div>
        </div>
      )}

      {/* Sync controls */}
      <div className="flex items-center justify-between pt-1">
        <div className="flex items-center gap-2.5">
          <Switch
            checked={!!config?.enabled}
            onChange={() => updateConfig({ enabled: !config?.enabled })}
            size="sm"
            ariaLabel={tr("syncEnable")}
          />
          <span className="text-xs text-ink-600">{tr("syncEnable")}</span>
        </div>
        <button
          type="button"
          onClick={handleSync}
          disabled={loading}
          className={`${actionBtnBase} text-paper bg-ink-900 hover:bg-ink-800`}
        >
          {loading ? <Loader2 size={12} className="animate-spin" /> : <Cloud size={12} />}
          {tr("syncNow")}
        </button>
      </div>

      {/* Status messages */}
      {result && (
        <div
          className={`animate-status-pop flex items-start gap-1.5 text-[11px] ${
            result.ok && !result.error ? "text-sage" : "text-seal"
          }`}
        >
          {result.ok && !result.error ? <Check size={13} className="mt-0.5 shrink-0" /> : <AlertCircle size={13} className="mt-0.5 shrink-0" />}
          <span>
            {result.ok
              ? result.error
                ? // Partial failure: some items failed to push — never swallow it.
                  result.error
                : result.mergedCount && result.mergedCount > 0
                  ? tr("syncMerged", { count: result.mergedCount })
                  : tr("syncSuccess")
              : result.error}
            {result.dedupedCount ? ` · ${tr("syncDeduped", { count: result.dedupedCount })}` : ""}
          </span>
        </div>
      )}

      {!result && config?.lastSyncAt && !config.lastError && (
        <p className="text-[11px] text-ink-500">{tr("syncLastSuccess", { time: formatTime(config.lastSyncAt, tr) })}</p>
      )}

      {config?.lastError && !result && (
        <p className="text-[11px] text-seal animate-status-pop">{tr("syncLastError", { error: config.lastError })}</p>
      )}
    </div>
  );
}
