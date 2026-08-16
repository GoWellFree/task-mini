import { getTelegramColorScheme } from "./telegram";

export type ThemePreference = "telegram" | "light" | "dark";

const STORAGE_KEY = "task_mini_theme";

export function getThemePreference(): ThemePreference {
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored === "light" || stored === "dark" ? stored : "telegram";
}

export function setThemePreference(preference: ThemePreference): void {
  localStorage.setItem(STORAGE_KEY, preference);
  applyTheme(preference);
}

/**
 * "telegram" isn't a real value for the `data-theme` attribute — it means
 * "no explicit override", so the CSS falls through to whichever of
 * Telegram's colorScheme / the OS `prefers-color-scheme` applies. Removing
 * the attribute (rather than setting it to something) is what lets that
 * media-query fallback in index.css actually take effect.
 */
export function applyTheme(preference: ThemePreference): void {
  const root = document.documentElement;
  if (preference === "light" || preference === "dark") {
    root.setAttribute("data-theme", preference);
    return;
  }

  const telegramScheme = getTelegramColorScheme();
  if (telegramScheme) {
    root.setAttribute("data-theme", telegramScheme);
  } else {
    root.removeAttribute("data-theme");
  }
}
