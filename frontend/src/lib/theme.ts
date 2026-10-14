import type { ThemePreference } from "@spendual/shared";

/** "system" removes data-theme so prefers-color-scheme decides (index.css). */
export function applyTheme(theme: ThemePreference): void {
  const root = document.documentElement;
  if (theme === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", theme);
}
