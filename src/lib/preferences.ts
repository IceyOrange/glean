const THEME_KEY = "glean_theme";
// Renamed from "glean_auto_thought": the old key could hold a `false` that was
// wrongly learned when reading-release dismissals (scroll-away) were counted
// as thought skips. The rename resets everyone back to the default (on).
const AUTO_THOUGHT_KEY = "glean_auto_open_thought";
const THOUGHT_SKIP_KEY = "glean_thought_skip_count";

/** After this many consecutive saves where the auto-opened thought editor is
 * dismissed empty, stop auto-opening it (the user clearly just wants to save). */
export const THOUGHT_SKIP_THRESHOLD = 3;

export type Theme = "auto" | "light" | "dark";

export async function getTheme(): Promise<Theme> {
  try {
    const result = await chrome.storage.local.get(THEME_KEY);
    const value = result[THEME_KEY];
    if (value === "light" || value === "dark") return value;
    return "auto";
  } catch {
    return "auto";
  }
}

export async function setTheme(theme: Theme): Promise<void> {
  await chrome.storage.local.set({ [THEME_KEY]: theme });
  applyTheme(theme);
}

export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const isDark = theme === "dark" || (theme === "auto" && prefersDark);

  if (isDark) {
    root.classList.add("dark");
    root.classList.remove("light");
  } else {
    root.classList.add("light");
    root.classList.remove("dark");
  }
  root.setAttribute("data-theme", theme);
}

export function listenSystemThemeChange(callback: () => void): () => void {
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  mq.addEventListener("change", callback);
  return () => mq.removeEventListener("change", callback);
}

/** Whether the thought editor opens automatically after each save. */
export async function getAutoThought(): Promise<boolean> {
  try {
    const result = await chrome.storage.local.get(AUTO_THOUGHT_KEY);
    return result[AUTO_THOUGHT_KEY] !== false;
  } catch {
    return true;
  }
}

export async function setAutoThought(value: boolean): Promise<void> {
  await chrome.storage.local.set({
    [AUTO_THOUGHT_KEY]: value,
    // Re-enabling manually also clears the learned skip count.
    [THOUGHT_SKIP_KEY]: 0,
  });
}

/**
 * Record that an auto-opened thought editor was dismissed empty.
 * Returns true when the threshold was just reached and auto-open turned off.
 */
export async function noteThoughtSkip(): Promise<boolean> {
  try {
    const result = await chrome.storage.local.get(THOUGHT_SKIP_KEY);
    const count = (result[THOUGHT_SKIP_KEY] as number | undefined) ?? 0;
    const next = count + 1;
    if (next >= THOUGHT_SKIP_THRESHOLD) {
      await chrome.storage.local.set({
        [AUTO_THOUGHT_KEY]: false,
        [THOUGHT_SKIP_KEY]: 0,
      });
      return true;
    }
    await chrome.storage.local.set({ [THOUGHT_SKIP_KEY]: next });
    return false;
  } catch {
    return false;
  }
}

/** The user actually wrote a thought — reset the skip streak. */
export async function resetThoughtSkips(): Promise<void> {
  try {
    await chrome.storage.local.set({ [THOUGHT_SKIP_KEY]: 0 });
  } catch {
    // Storage unavailable — nothing to reset.
  }
}
