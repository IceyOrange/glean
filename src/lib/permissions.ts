/**
 * Ask for access to exactly one user-configured API origin.
 *
 * Chrome requires host permissions for extension-page fetches.  Keeping them
 * optional lets a person choose any compatible endpoint without granting all
 * providers access at install time.
 */
export function toOriginPattern(rawUrl: string): string | null {
  try {
    const url = new URL(rawUrl);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return `${url.origin}/*`;
  } catch {
    return null;
  }
}

export async function ensureOriginPermission(rawUrl: string): Promise<boolean> {
  const pattern = toOriginPattern(rawUrl);
  if (!pattern) return false;

  // Allows unit tests and browsers without the optional permissions API to
  // continue to use their native fetch policy.
  if (!chrome.permissions) return true;

  const details = { origins: [pattern] };
  if (await chrome.permissions.contains(details)) return true;
  return chrome.permissions.request(details);
}
