// Thin wrapper around the Telegram Web App JS bridge, loaded globally via
// the <script> tag in index.html. Falls back gracefully outside Telegram
// (e.g. during local browser development) so the app doesn't crash.

interface TelegramThemeParams {
  bg_color?: string;
  text_color?: string;
  hint_color?: string;
  link_color?: string;
  button_color?: string;
  button_text_color?: string;
  secondary_bg_color?: string;
}

interface TelegramHapticFeedback {
  impactOccurred: (style: "light" | "medium" | "heavy" | "rigid" | "soft") => void;
  notificationOccurred: (type: "error" | "success" | "warning") => void;
  selectionChanged: () => void;
}

interface TelegramBackButton {
  isVisible: boolean;
  show: () => void;
  hide: () => void;
  onClick: (handler: () => void) => void;
  offClick: (handler: () => void) => void;
}

interface TelegramMainButton {
  text: string;
  isVisible: boolean;
  isActive: boolean;
  show: () => void;
  hide: () => void;
  enable: () => void;
  disable: () => void;
  setText: (text: string) => void;
  onClick: (handler: () => void) => void;
  offClick: (handler: () => void) => void;
}

interface TelegramSafeAreaInset {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

interface TelegramWebApp {
  initData: string;
  initDataUnsafe: { start_param?: string };
  themeParams: TelegramThemeParams;
  colorScheme?: "light" | "dark";
  viewportHeight?: number;
  viewportStableHeight?: number;
  safeAreaInset?: TelegramSafeAreaInset;
  contentSafeAreaInset?: TelegramSafeAreaInset;
  BackButton: TelegramBackButton;
  MainButton: TelegramMainButton;
  HapticFeedback: TelegramHapticFeedback;
  ready: () => void;
  expand: () => void;
  onEvent: (event: string, handler: () => void) => void;
  offEvent: (event: string, handler: () => void) => void;
}

declare global {
  interface Window {
    Telegram?: { WebApp?: TelegramWebApp };
  }
}

function getWebApp(): TelegramWebApp | undefined {
  return window.Telegram?.WebApp;
}

export function initTelegramApp(): void {
  const webApp = getWebApp();
  if (!webApp) return;

  webApp.ready();
  webApp.expand();
  applyThemeParams(webApp.themeParams);
  applySafeArea(webApp);
  webApp.onEvent("themeChanged", () => applyThemeParams(webApp.themeParams));
  webApp.onEvent("viewportChanged", () => applySafeArea(webApp));
}

function applyThemeParams(theme: TelegramThemeParams): void {
  const root = document.documentElement;
  const map: Record<string, string | undefined> = {
    "--tg-bg-color": theme.bg_color,
    "--tg-text-color": theme.text_color,
    "--tg-hint-color": theme.hint_color,
    "--tg-link-color": theme.link_color,
    "--tg-button-color": theme.button_color,
    "--tg-button-text-color": theme.button_text_color,
    "--tg-secondary-bg-color": theme.secondary_bg_color,
  };

  for (const [cssVar, value] of Object.entries(map)) {
    if (value) root.style.setProperty(cssVar, value);
  }
}

function applySafeArea(webApp: TelegramWebApp): void {
  const root = document.documentElement;
  const inset = webApp.safeAreaInset;
  root.style.setProperty("--tg-safe-area-top", `${inset?.top ?? 0}px`);
  root.style.setProperty("--tg-safe-area-bottom", `${inset?.bottom ?? 0}px`);
  if (webApp.viewportStableHeight) {
    root.style.setProperty("--tg-viewport-height", `${webApp.viewportStableHeight}px`);
  }
}

export function getInitData(): string | undefined {
  return getWebApp()?.initData || undefined;
}

export function getStartParam(): string | undefined {
  return getWebApp()?.initDataUnsafe.start_param;
}

export function isRunningInTelegram(): boolean {
  return Boolean(getWebApp()?.initData);
}

/** Telegram's own light/dark classification — used only to pick which NOVA token set applies, never as a color source itself. */
export function getTelegramColorScheme(): "light" | "dark" | undefined {
  return getWebApp()?.colorScheme;
}

/**
 * Shows Telegram's native back chevron and wires it to `onBack`. Returns a
 * cleanup function. A no-op outside Telegram so callers don't need to branch.
 * Deliberately not named with a "use" prefix — it's a plain imperative
 * helper (no internal hooks), and calling it from inside a useEffect (its
 * only real use so far) trips react-hooks/rules-of-hooks otherwise.
 */
export function bindTelegramBackButton(onBack: (() => void) | undefined): () => void {
  const webApp = getWebApp();
  if (!webApp || !onBack) return () => {};

  webApp.BackButton.show();
  webApp.BackButton.onClick(onBack);
  return () => {
    webApp.BackButton.offClick(onBack);
    webApp.BackButton.hide();
  };
}
