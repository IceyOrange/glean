export type FeedbackKind = "bug" | "feature" | "feedback";

export interface FeedbackDiagnostics {
  extensionVersion: string;
  browser: string;
  operatingSystem: string;
}

interface FeedbackDraft {
  kind: FeedbackKind;
  message: string;
  diagnostics?: FeedbackDiagnostics;
}

interface FeedbackEnvironment {
  userAgent?: string;
  extensionVersion?: string;
}

const ISSUE_BASE_URL = "https://github.com/IceyOrange/glean/issues/new";

const templateByKind: Record<FeedbackKind, string> = {
  bug: "bug_report.md",
  feature: "feature_request.md",
  feedback: "feedback.md",
};

const titlePrefixByKind: Record<FeedbackKind, string> = {
  bug: "Bug",
  feature: "Feature",
  feedback: "Feedback",
};

export function feedbackTemplateUrl(kind: FeedbackKind): string {
  return `${ISSUE_BASE_URL}?${new URLSearchParams({ template: templateByKind[kind] }).toString()}`;
}

function detectBrowser(userAgent: string): string {
  if (/Firefox\//i.test(userAgent)) return "Firefox";
  if (/Edg\//i.test(userAgent)) return "Microsoft Edge";
  if (/OPR\//i.test(userAgent)) return "Opera";
  if (/Chrome\//i.test(userAgent)) return "Chrome";
  if (/Safari\//i.test(userAgent)) return "Safari";
  return "Unknown browser";
}

function detectOperatingSystem(userAgent: string): string {
  if (/Android/i.test(userAgent)) return "Android";
  if (/iPhone|iPad|iPod/i.test(userAgent)) return "iOS/iPadOS";
  if (/Mac OS X/i.test(userAgent)) return "macOS";
  if (/Windows/i.test(userAgent)) return "Windows";
  if (/Linux/i.test(userAgent)) return "Linux";
  return "Unknown operating system";
}

/**
 * Collect only the small, reproducibility-oriented details a person elects to
 * include in a public issue. It deliberately excludes page URLs, clipped text,
 * extension ID, account data, and the full user agent string.
 */
export function getFeedbackDiagnostics(environment: FeedbackEnvironment = {}): FeedbackDiagnostics {
  const userAgent = environment.userAgent ?? (typeof navigator === "undefined" ? "" : navigator.userAgent);
  const extensionVersion =
    environment.extensionVersion ??
    (typeof chrome === "undefined" ? undefined : chrome.runtime?.getManifest?.().version) ??
    "Unknown";

  return {
    extensionVersion,
    browser: detectBrowser(userAgent),
    operatingSystem: detectOperatingSystem(userAgent),
  };
}

export function buildFeedbackUrl({ kind, message, diagnostics }: FeedbackDraft): string {
  const summary = message.trim().replace(/\s+/g, " ").slice(0, 72);
  const body = [
    "## Feedback",
    "",
    message.trim(),
    ...(diagnostics
      ? [
          "",
          "## Optional diagnostic information",
          "",
          `- Glean version: ${diagnostics.extensionVersion}`,
          `- Browser: ${diagnostics.browser}`,
          `- Operating system: ${diagnostics.operatingSystem}`,
        ]
      : []),
  ].join("\n");

  const params = new URLSearchParams({
    template: templateByKind[kind],
    title: `[${titlePrefixByKind[kind]}] ${summary || "New report"}`,
    body,
  });
  return `${ISSUE_BASE_URL}?${params.toString()}`;
}
