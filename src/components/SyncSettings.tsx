import { useEffect, useState } from "react";
import { Cloud, Check, AlertCircle, Loader2, ChevronDown, ExternalLink, Search } from "lucide-react";
import {
  SyncProvider,
  SavedSyncConfig,
  ProviderConfig,
  WebDAVConfig,
  SyncResult,
  getSyncConfig,
  saveSyncConfig,
  makeDefaultConfig,
  getProviderMeta,
  getAdapter,
  syncCards,
  isWebDAVProvider,
  searchDatabases,
} from "@/lib/sync";
import { getCards } from "@/lib/storage";

interface SyncSettingsProps {
  tr: (key: string, vars?: Record<string, string | number>) => string;
}

const PROVIDERS: SyncProvider[] = ["notion", "nutstore", "webdav"];

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

  useEffect(() => {
    getSyncConfig().then(setConfig);
  }, []);

  // Create or clear the periodic sync alarm whenever the user toggles sync.
  useEffect(() => {
    if (config?.enabled) {
      chrome.alarms.create("glean-sync", { periodInMinutes: 60 });
    } else {
      chrome.alarms.clear("glean-sync");
    }
  }, [config?.enabled]);

  const updateConfig = (patch: Partial<SavedSyncConfig>) => {
    setConfig((prev) => {
      const next = { ...(prev ?? { provider: "notion" as SyncProvider, enabled: false, config: makeDefaultConfig("notion"), providerConfigs: {} }), ...patch };
      void saveSyncConfig(next);
      return next;
    });
  };

  const updateProviderConfig = (patch: Partial<ProviderConfig>) => {
    setConfig((prev) => {
      if (!prev) return null;
      const newConfig = { ...prev.config, ...patch };
      const next = { ...prev, config: newConfig, providerConfigs: { ...prev.providerConfigs, [prev.provider]: newConfig } };
      void saveSyncConfig(next);
      return next;
    });
  };

  const handleProviderChange = (newProvider: SyncProvider) => {
    setConfig((prev) => {
      const base = prev ?? { provider: "notion" as SyncProvider, enabled: false, config: makeDefaultConfig("notion"), providerConfigs: {} };
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
  };

  const handleSync = async () => {
    if (!config) return;
    const adapter = getAdapter(config.provider);
    const error = adapter.validate(config.config);
    if (error) {
      setResult({ ok: false, error: tr("syncConfigIncomplete") });
      return;
    }

    setLoading(true);
    setResult(null);
    const cards = await getCards();
    const res = await syncCards(cards);
    setResult(res);
    setLoading(false);

    // Refresh saved config to pick up lastSyncAt / lastError.
    const saved = await getSyncConfig();
    if (saved) setConfig(saved);
  };

  const handleSearchDatabases = async () => {
    const token = (providerConfig as { token: string }).token?.trim();
    if (!token) return;
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

  const provider = config?.provider ?? "notion";
  const providerConfig = config?.config ?? makeDefaultConfig(provider);
  const meta = getProviderMeta(provider);

  const inputCls =
    "w-full px-3 py-2 text-sm bg-surface rounded-lg border border-line outline-none transition-shadow placeholder:text-ink-300 focus:border-seal/50 focus:ring-2 focus:ring-seal/20 text-ink-900";

  const notionToken = (providerConfig as { token: string }).token ?? "";
  const notionDbId = (providerConfig as { databaseId?: string }).databaseId ?? "";

  return (
    <div className="space-y-4">
      {/* Provider selector */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-ink-600">
          <Cloud size={14} />
          <span className="text-xs font-medium">{tr("syncProvider")}</span>
        </div>
        <div className="relative w-44">
          <select
            value={provider}
            onChange={(e) => handleProviderChange(e.target.value as SyncProvider)}
            className={`${inputCls} appearance-none pr-8 py-1.5 text-xs`}
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

      <p className="text-[11px] text-ink-500 leading-relaxed">
        {tr(meta.descriptionKey)}
      </p>

      {/* ─── Notion config ─── */}
      {provider === "notion" && (
        <div className="space-y-3">
          {/* Setup guide */}
          <div className="bg-surface border border-line-soft rounded-xl p-3 space-y-2">
            <button
              onClick={() => setShowGuide((v) => !v)}
              className="flex items-center gap-1 w-full text-left"
            >
              <span className="text-[11px] font-medium text-ink-600">{tr("syncNotionGuide")}</span>
              <ChevronDown size={12} className={`text-ink-400 transition-transform ${showGuide ? "" : "-rotate-90"}`} />
            </button>
            {showGuide && (
              <ol className="text-[11px] text-ink-500 space-y-1.5 pl-0.5 list-decimal list-inside">
                <li>
                  {tr("syncNotionStep1")}
                  <a
                    href="https://notion.so"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-0.5 text-seal hover:underline ml-1"
                  >
                    notion.so <ExternalLink size={9} />
                  </a>
                </li>
                <li>
                  {tr("syncNotionStep2")}
                  <a
                    href="https://www.notion.so/my-integrations"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-0.5 text-seal hover:underline ml-1"
                  >
                    Notion Integrations <ExternalLink size={9} />
                  </a>
                </li>
                <li>{tr("syncNotionStep3")}</li>
              </ol>
            )}
          </div>

          {/* Token input */}
          <div>
            <label className="block text-xs text-ink-600 mb-1">{tr("syncToken")}</label>
            <input
              type="password"
              value={notionToken}
              onChange={(e) => {
                updateProviderConfig({ token: e.target.value });
                // Reset search when token changes
                setDbSearchResults([]);
                setDbSearchError(null);
              }}
              placeholder="secret_..."
              className={inputCls}
            />
          </div>

          {/* Database selection */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs text-ink-600">{tr("syncDatabaseId")}</label>
              {notionToken.trim() && (
                <button
                  onClick={handleSearchDatabases}
                  disabled={dbSearchLoading}
                  className="flex items-center gap-1 text-[10px] text-seal hover:underline disabled:opacity-50"
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
                  className="text-[10px] text-ink-400 hover:text-ink-600"
                >
                  {tr("syncNotionManualId")}
                </button>
              </div>
            ) : (
              <div className="space-y-1">
                <input
                  type="text"
                  value={notionDbId}
                  onChange={(e) => updateProviderConfig({ databaseId: e.target.value || undefined })}
                  placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                  className={inputCls}
                />
                {dbSearchResults.length > 0 && manualDbId && (
                  <button
                    onClick={() => setManualDbId(false)}
                    className="text-[10px] text-seal hover:underline"
                  >
                    {tr("syncNotionSearchDb")}
                  </button>
                )}
              </div>
            )}

            {dbSearchError && (
              <p className="text-[10px] text-seal mt-1">{dbSearchError}</p>
            )}
          </div>
        </div>
      )}

      {/* ─── WebDAV config ─── */}
      {isWebDAVProvider(provider) && (
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-ink-600 mb-1">{tr("syncServerUrl")}</label>
            <input
              type="url"
              value={(providerConfig as WebDAVConfig).serverUrl}
              onChange={(e) => updateProviderConfig({ serverUrl: e.target.value })}
              className={inputCls}
            />
          </div>
          <div>
            <label className="block text-xs text-ink-600 mb-1">{tr("syncUsername")}</label>
            <input
              type="text"
              value={(providerConfig as WebDAVConfig).username}
              onChange={(e) => updateProviderConfig({ username: e.target.value })}
              className={inputCls}
            />
          </div>
          <div>
            <label className="block text-xs text-ink-600 mb-1">{tr("syncPassword")}</label>
            <input
              type="password"
              value={(providerConfig as WebDAVConfig).password}
              onChange={(e) => updateProviderConfig({ password: e.target.value })}
              className={inputCls}
            />
          </div>
          <div>
            <label className="block text-xs text-ink-600 mb-1">{tr("syncRemotePath")}</label>
            <input
              type="text"
              value={(providerConfig as WebDAVConfig).remotePath}
              onChange={(e) => updateProviderConfig({ remotePath: e.target.value })}
              className={inputCls}
            />
          </div>
        </div>
      )}

      {/* Sync controls */}
      <div className="flex items-center justify-between pt-1">
        <div className="flex items-center gap-2">
          <button
            onClick={() => updateConfig({ enabled: !config?.enabled })}
            className={`relative w-7 h-4 rounded-full transition-colors ${
              config?.enabled ? "bg-seal" : "bg-line"
            }`}
            aria-checked={config?.enabled}
            role="switch"
          >
            <span
              className={`absolute top-[2px] w-3 h-3 bg-paper rounded-full transition-all ${
                config?.enabled ? "left-[16px]" : "left-[2px]"
              }`}
            />
          </button>
          <span className="text-xs text-ink-600">{tr("syncEnable")}</span>
        </div>
        <button
          onClick={handleSync}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-paper bg-ink-900 rounded-lg hover:bg-ink-600 disabled:opacity-50 transition-colors"
        >
          {loading ? <Loader2 size={12} className="animate-spin" /> : <Cloud size={12} />}
          {tr("syncNow")}
        </button>
      </div>

      {/* Status messages */}
      {result && (
        <div
          className={`flex items-start gap-1.5 text-[11px] ${
            result.ok ? "text-sage" : "text-seal"
          }`}
        >
          {result.ok ? <Check size={12} /> : <AlertCircle size={12} />}
          <span>
            {result.ok
              ? tr("syncSuccess")
              : result.error}
          </span>
        </div>
      )}

      {!result && config?.lastSyncAt && !config.lastError && (
        <p className="text-[11px] text-ink-500">
          {tr("syncLastSuccess", { time: formatTime(config.lastSyncAt, tr) })}
        </p>
      )}

      {config?.lastError && !result && (
        <p className="text-[11px] text-seal">
          {tr("syncLastError", { error: config.lastError })}
        </p>
      )}
    </div>
  );
}
