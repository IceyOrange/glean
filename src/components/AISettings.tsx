import { useEffect, useState } from "react";
import { Check, Eye, EyeOff, Monitor, Sun, Moon } from "lucide-react";
import { AIConfig, getAIConfig, saveAIConfig } from "@/lib/ai";
import type { Lang } from "@/lib/i18n";
import { Theme, getTheme, setTheme, applyTheme } from "@/lib/preferences";

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
  { key: "zhipu", labelKey: "aiProviderZhipu", baseUrl: "https://open.bigmodel.cn/api/paas", model: "glm-4-flash" },
  { key: "anthropic", labelKey: "aiProviderAnthropic", baseUrl: "https://api.anthropic.com", model: "claude-3-5-sonnet-20241022" },
];

const VISIBLE_PRESET_COUNT = 4;



export function LanguageControl({
  lang,
  onSetLang,
}: {
  lang: Lang;
  onSetLang: (l: Lang) => void;
}) {
  return (
    <div className="flex gap-1 bg-line-soft rounded-lg p-1">
      {LANGS.map((l) => (
        <button
          key={l.code}
          onClick={() => onSetLang(l.code)}
          className={`flex-1 py-1.5 text-xs rounded-md transition-all ${
            lang === l.code
              ? "bg-ink-900 text-paper shadow-sm"
              : "text-ink-600 hover:text-ink-900"
          }`}
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
    <div className="flex gap-1 bg-line-soft rounded-lg p-1">
      {THEMES.map(({ value, icon: Icon, labelKey }) => (
        <button
          key={value}
          onClick={() => handleSetTheme(value)}
          title={tr(labelKey)}
          className={`flex-1 flex items-center justify-center gap-1 py-1.5 text-xs rounded-md transition-all ${
            theme === value
              ? "bg-ink-900 text-paper shadow-sm"
              : "text-ink-600 hover:text-ink-900"
          }`}
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
  const visiblePresets = showAllPresets
    ? AI_PRESETS
    : AI_PRESETS.slice(0, VISIBLE_PRESET_COUNT);
  const [configSaved, setConfigSaved] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<"ok" | "fail" | null>(null);

  useEffect(() => {
    getAIConfig().then((config) => {
      setAiConfig(config);
      if (config) {
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
    await saveAIConfig(config);
    setAiConfig(config);
    setConfigSaved(true);
    setTimeout(() => setConfigSaved(false), 2000);
    if (onSaved) setTimeout(onSaved, 1500);
  };

  const handleTest = async () => {
    const key = apiKeyInput.trim();
    if (!key) return;
    setTesting(true);
    setTestResult(null);
    try {
      const baseUrl = baseUrlInput.trim() || "https://api.deepseek.com";
      const isAnthropic = baseUrl.includes("anthropic.com");
      const res = isAnthropic
        ? await fetch(`${baseUrl}/v1/models`, {
            headers: {
              "x-api-key": key,
              "anthropic-version": "2023-06-01",
            },
          })
        : await fetch(`${baseUrl}/v1/models`, {
            headers: { Authorization: `Bearer ${key}` },
          });
      setTestResult(res.ok ? "ok" : "fail");
    } catch {
      setTestResult("fail");
    } finally {
      setTesting(false);
    }
  };

  const maskedKey = aiConfig?.apiKey
    ? aiConfig.apiKey.slice(0, 3) + "•••" + aiConfig.apiKey.slice(-4)
    : null;

  const inputCls =
    "w-full px-3 py-2 text-sm bg-surface rounded-lg border border-line outline-none transition-shadow focus:border-seal/50 focus:ring-2 focus:ring-seal/20 placeholder:text-ink-300 text-ink-900";

  const form = (
    <div className={framed ? "space-y-3" : "space-y-4"}>
      {/* Status badge */}
      {aiConfig && (
        <div className="flex justify-end -mb-1">
          <span
            className={`text-[10px] px-1.5 py-0.5 rounded-full ${
              testResult === "ok"
                ? "bg-sage/10 text-sage"
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
        <label className="block text-xs text-ink-600 mb-1">{tr("apiKey")}</label>
        <div className="relative">
          <input
            type={showApiKey ? "text" : "password"}
            value={apiKeyInput}
            onChange={(e) => {
              setApiKeyInput(e.target.value);
              setTestResult(null);
            }}
            placeholder="sk-..."
            className={`${inputCls} pr-10`}
          />
          <button
            onClick={() => setShowApiKey(!showApiKey)}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-ink-300 hover:text-ink-600 transition-colors"
          >
            {showApiKey ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
        </div>
        {maskedKey && !showApiKey && (
          <p className="text-[10px] text-ink-500 mt-1 pl-0.5 tabular-nums">{maskedKey}</p>
        )}
      </div>

      {/* Provider presets */}
      <div>
        <label className="block text-xs text-ink-600 mb-1">{tr("aiPresetLabel")}</label>
        <div className="flex flex-wrap gap-1">
          {visiblePresets.map((preset) => (
            <button
              key={preset.key}
              onClick={() => {
                setBaseUrlInput(preset.baseUrl);
                setModelInput(preset.model);
              }}
              title={tr(preset.labelKey)}
              className="flex-1 min-w-[52px] max-w-[50%] px-1 py-1.5 text-[10px] leading-none rounded-md bg-line-soft text-ink-600 hover:text-ink-900 hover:bg-surface transition-colors truncate"
            >
              {tr(preset.labelKey)}
            </button>
          ))}
          <button
            onClick={() => setShowAllPresets((v) => !v)}
            className="flex-1 min-w-[52px] max-w-[50%] px-1 py-1.5 text-[10px] leading-none rounded-md bg-line-soft text-ink-500 hover:text-ink-900 hover:bg-surface transition-colors"
          >
            {showAllPresets ? tr("showLess") : tr("showMore")}
          </button>
        </div>
      </div>

      {/* API URL */}
      <div>
        <label className="block text-xs text-ink-600 mb-1">{tr("apiUrl")}</label>
        <input
          type="url"
          value={baseUrlInput}
          onChange={(e) => {
            setBaseUrlInput(e.target.value);
            setTestResult(null);
          }}
          placeholder="https://api.deepseek.com"
          className={inputCls}
        />
      </div>

      {/* Model */}
      <div>
        <label className="block text-xs text-ink-600 mb-1">{tr("modelLabel")}</label>
        <input
          type="text"
          value={modelInput}
          onChange={(e) => {
            setModelInput(e.target.value);
            setTestResult(null);
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
          className="flex items-center gap-1 px-4 py-2 text-xs font-medium text-paper bg-ink-900 rounded-lg disabled:opacity-40 hover:bg-ink-600 transition-colors"
        >
          {configSaved ? <><Check size={12} /> {tr("saved")}</> : tr("save")}
        </button>
        {apiKeyInput.trim() && (
          <button
            onClick={handleTest}
            disabled={testing}
            className="flex items-center gap-1.5 px-3 py-2 text-xs text-ink-600 bg-surface rounded-lg border border-line hover:border-ink-300 disabled:opacity-50 transition-colors"
          >
            {testing ? (
              <span className="w-3 h-3 border border-line border-t-ink-600 rounded-full animate-spin" />
            ) : null}
            {tr("testConnection")}
          </button>
        )}
      </div>
      {testResult && (
        <p
          className={`text-[11px] ${
            testResult === "ok" ? "text-sage" : "text-seal"
          }`}
        >
          {testResult === "ok" ? tr("testConnectionOk") : tr("testConnectionFail")}
        </p>
      )}
    </div>
  );

  if (!framed) return form;
  return (
    <div className="bg-surface border border-line-soft rounded-xl p-3.5">{form}</div>
  );
}
