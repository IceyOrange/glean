import type { CitationSource } from "@/lib/types";

/**
 * Extract citation metadata from the current page.
 * Pure function — no side effects, easy to test.
 */
export function extractCitationSource(): CitationSource {
  const getMeta = (name: string): string | undefined => {
    const el =
      document.querySelector(`meta[property="${name}"]`) ??
      document.querySelector(`meta[name="${name}"]`);
    return el?.getAttribute("content")?.trim() || undefined;
  };

  const heading = (() => {
    const article = document.querySelector("article");
    const scope = article ?? document;
    const h1 = scope.querySelector("h1");
    return h1?.textContent?.trim() || undefined;
  })();

  const siteName =
    getMeta("og:site_name") ?? getMeta("application-name") ?? undefined;

  const ldData = (() => {
    const el = document.querySelector('script[type="application/ld+json"]');
    if (!el) return null;
    try {
      return JSON.parse(el.textContent ?? "");
    } catch {
      return null;
    }
  })();

  const author = (() => {
    const meta =
      getMeta("author") ??
      getMeta("article:author") ??
      getMeta("og:article:author");
    if (meta) return meta;

    if (ldData) {
      if (ldData.author?.name) return ldData.author.name;
      if (typeof ldData.author === "string") return ldData.author;
    }

    const byline = document.querySelector(
      '[rel="author"], .author, .byline, [itemprop="author"]'
    );
    return byline?.textContent?.trim() || undefined;
  })();

  const publishedAt = (() => {
    const meta =
      getMeta("article:published_time") ??
      getMeta("date") ??
      getMeta("publish_date");
    if (meta) return meta;

    const timeEl = document.querySelector(
      "article time[datetime], time[datetime]"
    );
    if (timeEl) return timeEl.getAttribute("datetime") || undefined;

    if (ldData?.datePublished) return ldData.datePublished;

    return undefined;
  })();

  const favicon = (() => {
    const link = document.querySelector(
      'link[rel="icon"], link[rel="shortcut icon"]'
    );
    const href = link?.getAttribute("href");
    if (!href) return undefined;
    try {
      return new URL(href, location.origin).href;
    } catch {
      return undefined;
    }
  })();

  return {
    url: location.href,
    title: document.title,
    heading,
    siteName,
    author,
    publishedAt,
    favicon,
  };
}
