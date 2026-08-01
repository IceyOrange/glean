import { useEffect, useRef, useState } from "react";
import { Check, Eye, EyeOff, Monitor, Sun, Moon, AlertCircle } from "lucide-react";
import { AIConfig, getAIConfig, saveAIConfig, apiPath } from "@/lib/ai";
import { ensureOriginPermission } from "@/lib/permissions";
import type { Lang } from "@/lib/i18n";
import { Theme, getTheme, setTheme } from "@/lib/preferences";

const LANGS: { code: Lang; label: string }[] = [
  { code: "zh", label: "中文" },
  { code: "en", label: "English" },
  { code: "fr", label: "Français" },
];

const THEMES: { value: Theme; icon: typeof Monitor; labelKey: string }[] = [
  { value: "auto", icon: Monitor, labelKey: "themeAuto" },
  { value: "light", icon: Sun, labelKey: "themeLight" },
  { value: "dark", icon: Moon, labelKey: "themeDark" },
];

interface AIPreset {
  key: string;
  labelKey: string;
  baseUrl: string;
  model: string;
}

const AI_PRESETS: AIPreset[] = [
  { key: "deepseek", labelKey: "aiProviderDeepseek", baseUrl: "https://api.deepseek.com", model: "deepseek-chat" },
  { key: "siliconflow", labelKey: "aiProviderSiliconflow", baseUrl: "https://api.siliconflow.cn", model: "deepseek-ai/DeepSeek-V3" },
  { key: "openai", labelKey: "aiProviderOpenai", baseUrl: "https://api.openai.com", model: "gpt-4o-mini" },
  { key: "kimi", labelKey: "aiProviderKimi", baseUrl: "https://api.moonshot.cn", model: "moonshot-v1-8k" },
  { key: "zhipu", labelKey: "aiProviderZhipu", baseUrl: "https://open.bigmodel.cn/api/paas/v4", model: "glm-4-flash-250414" },
  { key: "anthropic", labelKey: "aiProviderAnthropic", baseUrl: "https://api.anthropic.com", model: "claude-3-5-sonnet-20241022" },
];

const VISIBLE_PRESET_COUNT = 4;

const segmentedBtnBase =
  "flex-1 py-1.5 text-xs rounded-md transition-[color,background-color,box-shadow,transform] duration-200 ease-out-quint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-seal/50 focus-visible:ring-offset-2 focus-visible:ring-offset-paper active:scale-[0.97]";

export function LanguageControl({
  lang,
  onSetLang,
  label,
}: {
  lang: Lang;
  onSetLang: (l: Lang) => void;
  label: string;
}) {
  return (
    <div className="flex gap-1 bg-line-soft rounded-lg p-1" role="group" aria-label={label}>
      {LANGS.map((l) => (
        <button
          key={l.code}
          onClick={() => onSetLang(l.code)}
          className={`${segmentedBtnBase} ${
            lang === l.code
              ? "bg-ink-900 text-paper shadow-sm"
              : "text-ink-600 hover:text-ink-900 hover:bg-line-soft/80"
          }`}
          aria-pressed={lang === l.code}
        >
          {l.label}
        </button>
      ))}
    </div>
  );
}

export function ThemeControl({
  tr,
}: {
  tr: (key: string, vars?: Record<string, string | number>) => string;
}) {
  const [theme, setThemeState] = useState<Theme>("auto");

  useEffect(() => {
    getTheme().then(setThemeState);
  }, []);

  const handleSetTheme = async (value: Theme) => {
    await setTheme(value);
    setThemeState(value);
  };

  return (
    <div className="flex gap-1 bg-line-soft rounded-lg p-1" role="group" aria-label={tr("themeLabel")}>
      {THEMES.map(({ value, icon: Icon, labelKey }) => (
        <button
          key={value}
          onClick={() => handleSetTheme(value)}
          title={tr(labelKey)}
          className={`${segmentedBtnBase} flex items-center justify-center gap-1 ${
            theme === value
              ? "bg-ink-900 text-paper shadow-sm"
              : "text-ink-600 hover:text-ink-900 hover:bg-line-soft/80"
          }`}
          aria-pressed={theme === value}
        >
          <Icon size={13} />
          <span>{tr(labelKey)}</span>
        </button>
      ))}
    </div>
  );
}

export function AIConfigForm({
  tr,
  framed = false,
  onSaved,
}: {
  tr: (key: string, vars?: Record<string, string | number>) => string;
  /** Wrap the form in the surface card used by the popup settings view. */
  framed?: boolean;
  onSaved?: () => void;
}) {
  const [aiConfig, setAiConfig] = useState<AIConfig | null>(null);
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [baseUrlInput, setBaseUrlInput] = useState("");
  const [modelInput, setModelInput] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);
  const [showAllPresets, setShowAllPresets] = useState(false);
  const visiblePresets = showAllPresets ? AI_PRESETS : AI_PRESETS.slice(0, VISIBLE_PRESET_COUNT);
  const [configSaved, setConfigSaved] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<"ok" | "fail" | null>(null);
  const [testError, setTestError] = useState<string | null>(null);
  const [erroredField, setErroredField] = useState<"apiKey" | "baseUrl" | null>(null);
  // Set once the user touches any field — the async config load must never
  // overwrite an in-flight edit (looks like "paste doesn't work").
  const dirtyRef = useRef(false);

  useEffect(() => {
    getAIConfig().then((config) => {
      setAiConfig(config);
      if (config && !dirtyRef.current) {
        setApiKeyInput(config.apiKey);
        setBaseUrlInput(config.baseUrl || "");
        setModelInput(config.model || "");
      }
    });
  }, []);

  const handleSaveConfig = async () => {
    if (!apiKeyInput.trim()) return;
    const config: AIConfig = {
      apiKey: apiKeyInput.trim(),
      baseUrl: baseUrlInput.trim() || undefined,
      model: modelInput.trim() || undefined,
    };
    if (!(await ensureOriginPermission(config.baseUrl || "https://api.deepseek.com"))) {
      setTestResult("fail");
      setTestError(tr("permissionDenied"));
      setErroredField("baseUrl");
      return;
    }
    await saveAIConfig(config);
    setAiConfig(config);
    setConfigSaved(true);
    setTestResult(null);
    setTestError(null);
    setErroredField(null);
    setTimeout(() => setConfigSaved(false), 2000);
    if (onSaved) setTimeout(onSaved, 1500);
  };

  const handleTest = async () => {
    const key = apiKeyInput.trim();
    if (!key) return;
    setTesting(true);
    setTestResult(null);
    setTestError(null);
    try {
      const baseUrl = baseUrlInput.trim() || "https://api.deepseek.com";
      if (!(await ensureOriginPermission(baseUrl))) {
        setTestResult("fail");
        setTestError(tr("permissionDenied"));
        setErroredField("baseUrl");
        return;
      }
      const isAnthropic = baseUrl.includes("anthropic.com");
      const modelsUrl = isAnthropic ? `${baseUrl}/v1/models` : apiPath(baseUrl, "models");
      const res = isAnthropic
        ? await fetch(modelsUrl, {
            headers: {
              "x-api-key": key,
              "anthropic-version": "2023-06-01",
            },
          })
        : await fetch(modelsUrl, {
            headers: { Authorization: `Bearer ${key}` },
          });
      if (res.ok) {
        setTestResult("ok");
      } else {
        setTestResult("fail");
        if (res.status === 401 || res.status === 403) {
          setTestError(tr("testAuthFail"));
          setErroredField("apiKey");
        } else {
          setTestError(tr("testHttpError", { status: String(res.status) }));
          setErroredField("baseUrl");
        }
      }
    } catch {
      setTestResult("fail");
      setTestError(tr("testNetworkError"));
      setErroredField("baseUrl");
    } finally {
      setTesting(false);
    }
  };

  const maskedKey = aiConfig?.apiKey
    ? aiConfig.apiKey.slice(0, 3) + "•••" + aiConfig.apiKey.slice(-4)
    : null;

  const inputCls =
    "w-full px-3 py-2 text-sm bg-surface rounded-lg border border-line outline-none transition-[border-color,box-shadow] duration-200 hover:border-ink-300/40 focus:border-seal/50 focus:ring-[3px] focus:ring-seal/15 placeholder:text-ink-300 text-ink-900";

  const errorInputCls = "border-seal focus:border-seal focus:ring-seal/25";

  const presetBtnBase =
    "px-2 py-1.5 text-[10px] leading-none rounded-md transition-[color,background-color,transform] duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-seal/40 focus-visible:ring-offset-1 focus-visible:ring-offset-paper active:scale-[0.97]";

  const form = (
    <div className={framed ? "space-y-3" : "space-y-4"}>
      {/* Privacy hint */}
      <p className="text-[10px] text-ink-400 leading-relaxed">
        <a
          href="https://github.com/IceyOrange/glean/blob/main/site/privacy.html"
          target="_blank"
          rel="noopener noreferrer"
          className="underline decoration-ink-300/70 underline-offset-2 hover:text-ink-600 transition-colors"
        >
          {tr("aiPrivacyHint")}
        </a>
      </p>

      {/* Status badge */}
      {aiConfig && (
        <div className="flex justify-end -mb-1">
          <span
            key={testResult ?? "configured"}
            className={`animate-status-pop text-[10px] px-2 py-0.5 rounded-full font-medium ${
              testResult === "ok"
                ? "bg-sage/12 text-sage"
                : testResult === "fail"
                  ? "bg-seal/10 text-seal"
                  : "bg-line-soft text-ink-400"
            }`}
          >
            {testResult === "ok" ? tr("connected") : testResult === "fail" ? tr("connectFail") : tr("configured")}
          </span>
        </div>
      )}

      {/* API Key */}
      <div>
        <label htmlFor="ai-api-key" className="block text-xs text-ink-600 mb-1.5">{tr("apiKey")}</label>
        <div className="relative">
          <input
            id="ai-api-key"
            type={showApiKey ? "text" : "password"}
            value={apiKeyInput}
            onChange={(e) => {
              dirtyRef.current = true;
              setApiKeyInput(e.target.value);
              setTestResult(null);
              setTestError(null);
              setErroredField(null);
            }}
            placeholder="sk-..."
            className={`${inputCls} pr-10 ${erroredField === "apiKey" ? errorInputCls : ""}`}
          />
          <button
            onClick={() => setShowApiKey(!showApiKey)}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-ink-300 hover:text-ink-600 transition-colors rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-seal/40 focus-visible:ring-offset-1 focus-visible:ring-offset-paper"
            aria-label={showApiKey ? tr("panelHide") : tr("panelShow")}
          >
            {showApiKey ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
        </div>
        {maskedKey && !showApiKey && (
          <p className="text-[10px] text-ink-500 mt-1.5 pl-0.5 tabular-nums">{maskedKey}</p>
        )}
      </div>

      {/* Provider presets */}
      <div>
        <label className="block text-xs text-ink-600 mb-1.5">{tr("aiPresetLabel")}</label>
        <div className="flex flex-wrap gap-1.5">
          {visiblePresets.map((preset) => (
            <button
              key={preset.key}
              onClick={() => {
                dirtyRef.current = true;
                setBaseUrlInput(preset.baseUrl);
                setModelInput(preset.model);
                setTestResult(null);
                setTestError(null);
                setErroredField(null);
              }}
              title={tr(preset.labelKey)}
              className={`${presetBtnBase} flex-1 min-w-[56px] max-w-[50%] bg-line-soft text-ink-600 hover:text-ink-900 hover:bg-line-soft/80 truncate`}
            >
              {tr(preset.labelKey)}
            </button>
          ))}
          <button
            onClick={() => setShowAllPresets((v) => !v)}
            className={`${presetBtnBase} flex-1 min-w-[56px] max-w-[50%] bg-line-soft/70 text-ink-500 hover:text-ink-900 hover:bg-line-soft`}
          >
            {showAllPresets ? tr("showLess") : tr("showMore")}
          </button>
        </div>
      </div>

      {/* API URL */}
      <div>
        <label htmlFor="ai-api-url" className="block text-xs text-ink-600 mb-1.5">{tr("apiUrl")}</label>
        <input
          id="ai-api-url"
          type="url"
          value={baseUrlInput}
          onChange={(e) => {
            dirtyRef.current = true;
            setBaseUrlInput(e.target.value);
            setTestResult(null);
            setTestError(null);
            setErroredField(null);
          }}
          placeholder="https://api.deepseek.com"
          className={`${inputCls} ${erroredField === "baseUrl" ? errorInputCls : ""}`}
        />
      </div>

      {/* Model */}
      <div>
        <label htmlFor="ai-model" className="block text-xs text-ink-600 mb-1.5">{tr("modelLabel")}</label>
        <input
          id="ai-model"
          type="text"
          value={modelInput}
          onChange={(e) => {
            dirtyRef.current = true;
            setModelInput(e.target.value);
            setTestResult(null);
            setTestError(null);
            setErroredField(null);
          }}
          placeholder="deepseek-chat"
          className={inputCls}
        />
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 pt-0.5">
        <button
          onClick={handleSaveConfig}
          disabled={!apiKeyInput.trim()}
          className="flex items-center gap-1 px-4 py-2 text-xs font-medium text-paper bg-ink-900 rounded-lg disabled:opacity-40 hover:bg-ink-800 active:scale-[0.97] active:bg-ink-700 transition-[background-color,transform,opacity] duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-seal/50 focus-visible:ring-offset-2 focus-visible:ring-offset-paper"
        >
          {configSaved ? <><Check size={12} /> {tr("saved")}</> : tr("save")}
        </button>
        {apiKeyInput.trim() && (
          <button
            onClick={handleTest}
            disabled={testing}
            className="flex items-center gap-1.5 px-3 py-2 text-xs text-ink-600 bg-surface rounded-lg border border-line hover:border-ink-300 hover:bg-line-soft/40 disabled:opacity-50 active:scale-[0.97] transition-[color,background-color,border-color,transform,opacity] duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-seal/40 focus-visible:ring-offset-2 focus-visible:ring-offset-paper"
          >
            {testing ? (
              <span className="w-3 h-3 border border-line border-t-ink-600 rounded-full animate-spin" />
            ) : null}
            {tr("testConnection")}
          </button>
        )}
      </div>

      {testResult && (
        <div
          className={`animate-status-pop flex items-start gap-1.5 text-[11px] ${
            testResult === "ok" ? "text-sage" : "text-seal"
          }`}
        >
          {testResult === "ok" ? <Check size={13} className="mt-0.5 shrink-0" /> : <AlertCircle size={13} className="mt-0.5 shrink-0" />}
          <span>{testResult === "ok" ? tr("testConnectionOk") : testError || tr("testConnectionFail")}</span>
        </div>
      )}
    </div>
  );

  if (!framed) return form;
  return <div className="bg-surface border border-line-soft rounded-xl p-3.5 transition-colors duration-200">{form}</div>;
}
