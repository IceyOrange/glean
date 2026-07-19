import { Lang, t } from "@/lib/i18n";
import { SettingsPanel } from "@/components/SettingsPanel";

interface SettingsModalProps {
  lang: Lang;
  onSetLang: (lang: Lang) => void;
  onSaved: () => void;
  onClose: () => void;
  settingsTitle: string;
  settingsDesc: string;
  cancelLabel: string;
}

export function SettingsModal({
  lang,
  onSetLang,
  onSaved,
  onClose,
  settingsTitle,
  settingsDesc,
  cancelLabel,
}: SettingsModalProps) {
  const tr = (key: string, vars?: Record<string, string | number>) => t(key, lang, vars);
  return (
    <div className="fixed inset-0 bg-ink-900/30 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-surface rounded-2xl border border-line-soft shadow-xl p-6 w-[420px] max-w-full max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="font-quote text-[16px] font-semibold text-ink-900 mb-1">{settingsTitle}</h3>
        <p className="text-xs text-ink-500 leading-relaxed mb-5">
          {settingsDesc}
        </p>

        <SettingsPanel lang={lang} tr={tr} onSetLang={onSetLang} onSaved={onSaved} />

        <div className="flex justify-end mt-6 pt-4 border-t border-line-soft">
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
