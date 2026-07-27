import { useMemo, useState } from "react";
import { Bug, ExternalLink, Lightbulb, MessageCircle, ShieldCheck } from "lucide-react";
import {
  buildFeedbackUrl,
  feedbackTemplateUrl,
  getFeedbackDiagnostics,
  type FeedbackKind,
} from "@/lib/feedback";

interface FeedbackSectionProps {
  tr: (key: string, vars?: Record<string, string | number>) => string;
}

const FEEDBACK_LIMIT = 1800;

export function FeedbackSection({ tr }: FeedbackSectionProps) {
  const [kind, setKind] = useState<FeedbackKind>("feedback");
  const [message, setMessage] = useState("");
  const [includeDiagnostics, setIncludeDiagnostics] = useState(false);
  const diagnostics = useMemo(() => getFeedbackDiagnostics(), []);

  const feedbackUrl = useMemo(() => {
    if (!message.trim()) return feedbackTemplateUrl(kind);
    return buildFeedbackUrl({
      kind,
      message,
      diagnostics: includeDiagnostics ? diagnostics : undefined,
    });
  }, [diagnostics, includeDiagnostics, kind, message]);

  const options: Array<{
    kind: FeedbackKind;
    label: string;
    description: string;
    icon: typeof Bug;
  }> = [
    { kind: "bug", label: tr("feedbackBug"), description: tr("feedbackBugDesc"), icon: Bug },
    { kind: "feature", label: tr("feedbackFeature"), description: tr("feedbackFeatureDesc"), icon: Lightbulb },
    { kind: "feedback", label: tr("feedbackGeneral"), description: tr("feedbackGeneralDesc"), icon: MessageCircle },
  ];

  return (
    <div className="space-y-4">
      <p className="text-xs text-ink-600 leading-relaxed">{tr("feedbackIntro")}</p>

      <div className="grid grid-cols-3 gap-2" role="group" aria-label={tr("feedbackTypeLabel")}>
        {options.map(({ kind: optionKind, label, description, icon: Icon }) => {
          const selected = kind === optionKind;
          return (
            <button
              key={optionKind}
              type="button"
              aria-pressed={selected}
              onClick={() => setKind(optionKind)}
              className={`min-w-0 rounded-lg border px-2 py-2 text-left transition-colors duration-200 ease-out-quart focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-seal/40 focus-visible:ring-offset-1 focus-visible:ring-offset-paper active:scale-[0.98] ${
                selected
                  ? "border-seal/40 bg-seal-soft text-ink-900"
                  : "border-line-soft bg-surface text-ink-600 hover:border-ink-300/70 hover:bg-line-soft/50"
              }`}
            >
              <Icon size={14} className={selected ? "text-seal" : "text-ink-400"} aria-hidden="true" />
              <span className="mt-1.5 block text-[11px] font-semibold leading-tight">{label}</span>
              <span className="mt-0.5 block text-[10px] leading-snug text-ink-500">{description}</span>
            </button>
          );
        })}
      </div>

      <div>
        <div className="mb-1.5 flex items-baseline justify-between gap-3">
          <label htmlFor="feedback-message" className="text-xs text-ink-600">
            {tr(`feedback${kind.charAt(0).toUpperCase()}${kind.slice(1)}Prompt`)}
          </label>
          <span className="text-[10px] tabular-nums text-ink-400">
            {tr("feedbackCharacterCount", { count: message.length, max: FEEDBACK_LIMIT })}
          </span>
        </div>
        <textarea
          id="feedback-message"
          value={message}
          maxLength={FEEDBACK_LIMIT}
          onChange={(event) => setMessage(event.target.value)}
          placeholder={tr("feedbackPlaceholder")}
          rows={4}
          className="w-full resize-y rounded-lg border border-line bg-surface px-3 py-2 text-xs leading-relaxed text-ink-900 outline-none transition-colors duration-200 placeholder:text-ink-300 hover:border-ink-300/60 focus:border-seal/50 focus:ring-[3px] focus:ring-seal/15"
        />
      </div>

      <label className="flex cursor-pointer items-start gap-2.5 text-xs leading-relaxed text-ink-600">
        <input
          type="checkbox"
          checked={includeDiagnostics}
          onChange={(event) => setIncludeDiagnostics(event.target.checked)}
          className="mt-0.5 h-3.5 w-3.5 rounded border-line text-seal accent-[oklch(var(--seal))] focus:ring-seal/30"
        />
        <span>
          {tr("feedbackIncludeDiagnostics", {
            version: diagnostics.extensionVersion,
            browser: diagnostics.browser,
            os: diagnostics.operatingSystem,
          })}
        </span>
      </label>

      <div className="flex items-start gap-2 rounded-lg border border-line-soft bg-line-soft/45 px-3 py-2.5 text-[11px] leading-relaxed text-ink-500">
        <ShieldCheck size={14} className="mt-0.5 shrink-0 text-seal" aria-hidden="true" />
        <p>{tr("feedbackPrivacyHint")}</p>
      </div>

      <a
        href={feedbackUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-ink-900 px-3 py-2.5 text-xs font-medium text-paper transition-colors duration-200 ease-out-quart hover:bg-ink-800 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-seal/50 focus-visible:ring-offset-2 focus-visible:ring-offset-paper"
      >
        {message.trim() ? tr("feedbackContinue") : tr("feedbackOpenGithub")}
        <ExternalLink size={13} aria-hidden="true" />
      </a>
      <p className="text-center text-[10px] leading-relaxed text-ink-400">{tr("feedbackSubmitHint")}</p>
    </div>
  );
}
