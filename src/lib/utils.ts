import type { Lang } from "./i18n";

const LOCALE_MAP: Record<Lang, string> = {
  zh: "zh-CN",
  en: "en-US",
  fr: "fr-FR",
};

/**
 * Format a unix timestamp (milliseconds) as a localized relative time string.
 * Uses Intl.RelativeTimeFormat for proper i18n support.
 */
export function formatRelativeDate(ts: number, lang: Lang = "zh"): string {
  const diff = Math.floor((Date.now() - ts) / 1000);
  const locale = LOCALE_MAP[lang] || "zh-CN";
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });

  if (diff < 60) return rtf.format(-diff, "second");
  if (diff < 3600) return rtf.format(-Math.floor(diff / 60), "minute");
  if (diff < 86400) return rtf.format(-Math.floor(diff / 3600), "hour");
  if (diff < 2592000) return rtf.format(-Math.floor(diff / 86400), "day");

  return new Date(ts).toLocaleDateString(locale, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/**
 * Parse a date string and format it as a localized date.
 * Returns the raw string unchanged if parsing fails.
 */
export function formatPublishedDate(raw: string, lang: Lang = "zh"): string {
  const date = new Date(raw);
  if (isNaN(date.getTime())) return raw;
  const locale = LOCALE_MAP[lang] || "zh-CN";
  return date.toLocaleDateString(locale, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/**
 * Truncate a string to `max` characters, appending an ellipsis if truncated.
 */
export function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max) + "…";
}

export type DayGroup = "today" | "yesterday" | "earlier";

/**
 * Bucket a timestamp into today / yesterday / earlier, relative to `now`
 * (injectable for tests). Day boundaries are local-time midnights.
 */
export function dayGroup(ts: number, now: Date = new Date()): DayGroup {
  const startOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate()
  ).getTime();
  if (ts >= startOfToday) return "today";
  if (ts >= startOfToday - 86_400_000) return "yesterday";
  return "earlier";
}
