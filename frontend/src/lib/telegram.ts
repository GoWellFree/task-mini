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

interface TelegramWebApp {
  initData: string;
  initDataUnsafe: { start_param?: string };
  themeParams: TelegramThemeParams;
  ready: () => void;
  expand: () => void;
  onEvent: (event: string, handler: () => void) => void;
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
  webApp.onEvent("themeChanged", () => applyThemeParams(webApp.themeParams));
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

export function getInitData(): string | undefined {
  return getWebApp()?.initData || undefined;
}

export function getStartParam(): string | undefined {
  return getWebApp()?.initDataUnsafe.start_param;
}

export function isRunningInTelegram(): boolean {
  return Boolean(getWebApp()?.initData);
}
