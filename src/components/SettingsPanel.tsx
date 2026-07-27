import { useState, useEffect } from "react";
import { ChevronDown } from "lucide-react";
import { LanguageControl, ThemeControl, AIConfigForm } from "@/components/AISettings";
import { SyncSettings } from "@/components/SyncSettings";
import { getAIConfig } from "@/lib/ai";
import { getAutoThought, setAutoThought } from "@/lib/preferences";
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
    <p className="block text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-500 mb-2.5 pb-2 border-b border-line-soft transition-colors duration-200">
      {children}
    </p>
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
    <section className="bg-surface border border-line-soft rounded-xl overflow-hidden shadow-sm transition-colors duration-200">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2.5 w-full text-left group px-3.5 py-2.5 hover:bg-line-soft/60 active:bg-line-soft transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-seal/40 focus-visible:ring-inset"
        aria-expanded={open}
      >
        {status && (
          <span
            className={`w-2 h-2 rounded-full flex-shrink-0 transition-colors duration-200 ${
              status === "configured"
                ? "bg-sage shadow-[0_0_0_3px_oklch(var(--sage)/0.18)]"
                : "bg-ink-300"
            }`}
          />
        )}
        <span className="text-[13px] font-semibold uppercase tracking-[0.08em] text-ink-700">
          {label}
        </span>
        <ChevronDown
          size={14}
          className={`ml-auto text-ink-400 transition-transform duration-300 ease-out-quint ${
            open ? "rotate-0" : "-rotate-90"
          }`}
        />
      </button>
      <div
        className={`grid transition-[grid-template-rows] duration-300 ease-out-quint ${
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        }`}
      >
        <div className="overflow-hidden min-h-0">
          <div className="px-3.5 pb-3.5 pt-1 border-t border-line-soft">
            {children}
          </div>
        </div>
      </div>
    </section>
  );
}

export interface SwitchProps {
  checked: boolean;
  onChange: () => void;
  size?: "sm" | "md";
  disabled?: boolean;
  ariaLabel?: string;
}

export function Switch({
  checked,
  onChange,
  size = "md",
  disabled = false,
  ariaLabel,
}: SwitchProps) {
  const [pressed, setPressed] = useState(false);

  const sizing =
    size === "sm"
      ? { track: "w-7 h-4", knob: "w-3 h-3", translate: "translate-x-3" }
      : { track: "w-9 h-[22px]", knob: "w-[18px] h-[18px]", translate: "translate-x-[17px]" };

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={onChange}
      onMouseDown={() => setPressed(true)}
      onMouseUp={() => setPressed(false)}
      onMouseLeave={() => setPressed(false)}
      onTouchStart={() => setPressed(true)}
      onTouchEnd={() => setPressed(false)}
      className={`relative inline-flex items-center rounded-full ${sizing.track} transition-all duration-200 ease-out-quint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-seal/50 focus-visible:ring-offset-2 focus-visible:ring-offset-paper focus-visible:rounded-full disabled:opacity-50 disabled:cursor-not-allowed ${
        checked ? "bg-ink-900" : "bg-line"
      } ${pressed ? "scale-[0.96]" : "scale-100"}`}
    >
      <span
        className={`absolute left-[2px] rounded-full bg-paper shadow-sm ${sizing.knob} transition-transform duration-[250ms] ease-out-quint ${
          checked ? sizing.translate : "translate-x-0"
        }`}
      />
    </button>
  );
}

export function CaptureControl({
  tr,
}: {
  tr: (key: string, vars?: Record<string, string | number>) => string;
}) {
  const [autoThought, setAutoThoughtState] = useState(true);

  useEffect(() => {
    getAutoThought().then(setAutoThoughtState);
  }, []);

  const toggle = async () => {
    const next = !autoThought;
    await setAutoThought(next);
    setAutoThoughtState(next);
  };

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs text-ink-600 leading-relaxed">{tr("captureAutoThought")}</span>
        <Switch checked={autoThought} onChange={toggle} size="sm" ariaLabel={tr("captureAutoThought")} />
      </div>
      <p className="text-[10px] text-ink-400 leading-relaxed">
        {tr("captureAutoThoughtHint")}
      </p>
      <p className="text-[10px] text-ink-400 leading-relaxed">
        {tr("captureHotkeyHint")}
      </p>
    </div>
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
      if (!c) {
        setSyncConfigured(false);
        return;
      }
      try {
        const adapter = getAdapter(c.provider);
        setSyncConfigured(adapter.validate(c.config) === null);
      } catch {
        setSyncConfigured(false);
      }
    });
  }, []);

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
        <SectionLabel>{tr("captureSection")}</SectionLabel>
        <CaptureControl tr={tr} />
      </section>

      <CollapsibleSection
        label={tr("aiProvider")}
        status={aiConfigured ? "configured" : "unconfigured"}
        defaultOpen={false}
      >
        <AIConfigForm tr={tr} onSaved={onSaved} />
      </CollapsibleSection>

      <CollapsibleSection
        label={tr("cloudSync")}
        status={syncConfigured ? "configured" : "unconfigured"}
        defaultOpen={false}
      >
        <SyncSettings tr={tr} />
      </CollapsibleSection>
    </div>
  );
}
