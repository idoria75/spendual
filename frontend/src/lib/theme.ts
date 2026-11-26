import { ThemePreference } from "@spendual/shared";

const KEY = "spendual.theme";

/** The cache is a per-viewer convenience for the first paint. The server stays the source. */
function readCache(): ThemePreference | null {
  try {
    const parsed = ThemePreference.safeParse(localStorage.getItem(KEY));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function writeCache(theme: ThemePreference): void {
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    // Storage can be blocked. The theme still applies for this visit.
  }
}

function setAttribute(theme: ThemePreference): void {
  const root = document.documentElement;
  if (theme === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", theme);
}

/** "system" removes data-theme so prefers-color-scheme decides (index.css). */
export function applyTheme(theme: ThemePreference): void {
  setAttribute(theme);
  writeCache(theme);
}

/** Call before the first render, so the page does not flash the wrong theme. */
export function applyCachedTheme(): void {
  const cached = readCache();
  if (cached) setAttribute(cached);
}
