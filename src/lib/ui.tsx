/**
 * Shared UI helpers used by both the popup and the journal page.
 */

// Muted palette harmonized with the warm paper theme.
export const PALETTE = [
  "#8f6b4a", // umber
  "#6e7f56", // moss
  "#a05c50", // clay
  "#5e7a86", // slate
  "#8d6076", // plum
  "#7a6a94", // wisteria
  "#5d8a80", // pine
  "#96793f", // brass
];

/** Deterministic color for a given site/heading string. */
export function siteColor(site: string): string {
  let hash = 0;
  for (let i = 0; i < site.length; i++) {
    hash = ((hash << 5) - hash + site.charCodeAt(i)) | 0;
  }
  return PALETTE[Math.abs(hash) % PALETTE.length];
}

/** Wrap every occurrence of `query` in a <mark> for search highlighting. */
export function highlight(text: string, query: string): React.ReactNode {
  if (!query) return text;
  const lower = text.toLowerCase();
  const q = query.toLowerCase();
  const parts: React.ReactNode[] = [];
  let i = 0;
  for (;;) {
    const j = lower.indexOf(q, i);
    if (j === -1) {
      parts.push(text.slice(i));
      break;
    }
    if (j > i) parts.push(text.slice(i, j));
    parts.push(
      <mark key={j} className="bg-seal-soft text-inherit rounded-[2px]">
        {text.slice(j, j + q.length)}
      </mark>
    );
    i = j + q.length;
  }
  return parts;
}
