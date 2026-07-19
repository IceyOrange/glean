import { LanguageControl, ThemeControl, AIConfigForm } from "@/components/AISettings";
import { SyncSettings } from "@/components/SyncSettings";
import type { Lang } from "@/lib/i18n";

interface SettingsPanelProps {
  lang: Lang;
  tr: (key: string, vars?: Record<string, string | number>) => string;
  onSetLang: (lang: Lang) => void;
  onSaved?: () => void;
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="block text-[10px] font-medium uppercase tracking-[0.12em] text-ink-500 mb-2">
      {children}
    </label>
  );
}

export function SettingsPanel({ lang, tr, onSetLang, onSaved }: SettingsPanelProps) {
  return (
    <div className="space-y-5">
      <section>
        <SectionLabel>{tr("langLabel")}</SectionLabel>
        <LanguageControl lang={lang} onSetLang={onSetLang} />
      </section>

      <section>
        <SectionLabel>{tr("appearanceSection")}</SectionLabel>
        <ThemeControl tr={tr} />
      </section>

      <section>
        <SectionLabel>{tr("aiProvider")}</SectionLabel>
        <AIConfigForm tr={tr} onSaved={onSaved} />
      </section>

      <section>
        <SectionLabel>{tr("cloudSync")}</SectionLabel>
        <SyncSettings tr={tr} />
      </section>
    </div>
  );
}
