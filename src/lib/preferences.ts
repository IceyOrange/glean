const THEME_KEY = "glean_theme";

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
