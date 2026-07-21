import { useState, useEffect } from "react";
import { ChevronDown } from "lucide-react";
import { LanguageControl, ThemeControl, AIConfigForm } from "@/components/AISettings";
import { SyncSettings } from "@/components/SyncSettings";
import { getAIConfig } from "@/lib/ai";
import { getSyncConfig, getAdapter } from "@/lib/sync";
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

function CollapsibleSection({
  label,
  defaultOpen = true,
  status,
  children,
}: {
  label: string;
  defaultOpen?: boolean;
  status?: "configured" | "unconfigured";
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 w-full text-left group mb-2"
      >
        {status && (
          <span
            className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
              status === "configured" ? "bg-sage" : "bg-ink-300"
            }`}
          />
        )}
        <label className="text-[10px] font-medium uppercase tracking-[0.12em] text-ink-500 cursor-pointer">
          {label}
        </label>
        <ChevronDown
          size={12}
          className={`text-ink-400 transition-transform ${open ? "" : "-rotate-90"}`}
        />
      </button>
      <div
        className={`transition-all duration-200 ease-in-out ${
          open ? "max-h-[2000px] opacity-100 overflow-visible" : "max-h-0 opacity-0 overflow-hidden"
        }`}
      >
        {children}
      </div>
    </section>
  );
}

export function SettingsPanel({ lang, tr, onSetLang, onSaved }: SettingsPanelProps) {
  const [aiConfigured, setAiConfigured] = useState(false);
  const [syncConfigured, setSyncConfigured] = useState(false);

  useEffect(() => {
    getAIConfig().then((c) => setAiConfigured(!!c?.apiKey));
  }, []);

  useEffect(() => {
    getSyncConfig().then((c) => {
      if (!c) { setSyncConfigured(false); return; }
      try {
        const adapter = getAdapter(c.provider);
        setSyncConfigured(adapter.validate(c.config) === null);
      } catch {
        setSyncConfigured(false);
      }
    });
  }, []);

  return (
    <div className="space-y-4">
      <section>
        <SectionLabel>{tr("langLabel")}</SectionLabel>
        <LanguageControl lang={lang} onSetLang={onSetLang} />
      </section>

      <section>
        <SectionLabel>{tr("appearanceSection")}</SectionLabel>
        <ThemeControl tr={tr} />
      </section>

      <CollapsibleSection
        label={tr("aiProvider")}
        status={aiConfigured ? "configured" : "unconfigured"}
        defaultOpen={!aiConfigured}
      >
        <AIConfigForm tr={tr} onSaved={onSaved} />
      </CollapsibleSection>

      <CollapsibleSection
        label={tr("cloudSync")}
        status={syncConfigured ? "configured" : "unconfigured"}
        defaultOpen={!syncConfigured}
      >
        <SyncSettings tr={tr} />
      </CollapsibleSection>
    </div>
  );
}
