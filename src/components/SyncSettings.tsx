import { useEffect, useState } from "react";
import { Cloud, Check, AlertCircle, Loader2, ChevronDown } from "lucide-react";
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
} from "@/lib/sync";
import { getCards } from "@/lib/storage";

interface SyncSettingsProps {
  tr: (key: string, vars?: Record<string, string | number>) => string;
}

const PROVIDERS: SyncProvider[] = ["notion", "nutstore", "webdav", "koofr", "pcloud", "infini"];

function formatTime(timestamp: number | undefined, tr: SyncSettingsProps["tr"]) {
  if (!timestamp) return tr("syncNever");
  return new Date(timestamp).toLocaleString();
}

export function SyncSettings({ tr }: SyncSettingsProps) {
  const [config, setConfig] = useState<SavedSyncConfig | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SyncResult | null>(null);

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
      const next = { ...(prev ?? { provider: "notion" as SyncProvider, enabled: false, config: makeDefaultConfig("notion") }), ...patch };
      void saveSyncConfig(next);
      return next;
    });
  };

  const updateProviderConfig = (patch: Partial<ProviderConfig>) => {
    setConfig((prev) => {
      if (!prev) return null;
      const next = { ...prev, config: { ...prev.config, ...patch } };
      void saveSyncConfig(next);
      return next;
    });
  };

  const handleProviderChange = (provider: SyncProvider) => {
    updateConfig({ provider, config: makeDefaultConfig(provider) });
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

  const provider = config?.provider ?? "notion";
  const providerConfig = config?.config ?? makeDefaultConfig(provider);
  const meta = getProviderMeta(provider);

  const inputCls =
    "w-full px-3 py-2 text-sm bg-surface rounded-lg border border-line outline-none transition-shadow placeholder:text-ink-300 focus:border-seal/50 focus:ring-2 focus:ring-seal/20 text-ink-900";

  return (
    <div className="space-y-4">
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

      <p className="text-[11px] text-ink-400 leading-relaxed">
        {tr(meta.descriptionKey)}
      </p>

      {provider === "notion" && (
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-ink-600 mb-1">{tr("syncToken")}</label>
            <input
              type="password"
              value={(providerConfig as { token: string }).token}
              onChange={(e) => updateProviderConfig({ token: e.target.value })}
              placeholder="secret_..."
              className={inputCls}
            />
          </div>
          <div>
            <label className="block text-xs text-ink-600 mb-1">{tr("syncDatabaseId")}</label>
            <input
              type="text"
              value={(providerConfig as { databaseId?: string }).databaseId ?? ""}
              onChange={(e) =>
                updateProviderConfig({ databaseId: e.target.value || undefined })
              }
              placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
              className={inputCls}
            />
          </div>
        </div>
      )}

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

      <div className="flex items-center gap-2">
        <button
          onClick={handleSync}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-paper bg-ink-900 rounded-lg hover:bg-ink-600 disabled:opacity-50 transition-colors"
        >
          {loading ? <Loader2 size={12} className="animate-spin" /> : <Cloud size={12} />}
          {tr("syncNow")}
        </button>
      </div>

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
        <p className="text-[11px] text-ink-400">
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
