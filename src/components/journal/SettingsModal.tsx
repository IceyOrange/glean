import { Lang, t } from "@/lib/i18n";
import { LanguageControl, ThemeControl, AIConfigForm } from "@/components/AISettings";

interface SettingsModalProps {
  lang: Lang;
  onSetLang: (lang: Lang) => void;
  onSaved: () => void;
  onClose: () => void;
  settingsTitle: string;
  settingsDesc: string;
  langLabel: string;
  themeLabel: string;
  cancelLabel: string;
}

export function SettingsModal({
  lang,
  onSetLang,
  onSaved,
  onClose,
  settingsTitle,
  settingsDesc,
  langLabel,
  themeLabel,
  cancelLabel,
}: SettingsModalProps) {
  const tr = (key: string, vars?: Record<string, string | number>) => t(key, lang, vars);
  return (
    <div className="fixed inset-0 bg-ink-900/25 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-surface rounded-2xl border border-line-soft shadow-xl p-6 w-96 max-w-[90vw]" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-quote text-[16px] font-semibold text-ink-900 mb-1.5">{settingsTitle}</h3>
        <p className="text-xs text-ink-400 leading-relaxed mb-5">
          {settingsDesc}
        </p>

        <div className="space-y-4 mb-5">
          <div>
            <label className="block text-[10px] font-medium uppercase tracking-[0.12em] text-ink-400 mb-2">{langLabel}</label>
            <LanguageControl lang={lang} onSetLang={onSetLang} />
          </div>
          <div>
            <label className="block text-[10px] font-medium uppercase tracking-[0.12em] text-ink-400 mb-2">{themeLabel}</label>
            <ThemeControl tr={tr} />
          </div>
          <AIConfigForm tr={tr} onSaved={onSaved} />
        </div>

        <div className="flex justify-end">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-xs text-ink-600 hover:bg-line-soft rounded-lg transition-colors"
          >
            {cancelLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
