// Single wrapper around Telegram.WebApp.HapticFeedback — no component should
// touch window.Telegram directly. No-op outside Telegram (desktop browser
// dev, or HapticFeedback unsupported on that client) rather than throwing.

function feedback() {
  return window.Telegram?.WebApp?.HapticFeedback;
}

export const haptics = {
  /** A UI element was tapped — buttons, list items, toggles. */
  tap(style: "light" | "medium" | "heavy" | "rigid" | "soft" = "light"): void {
    feedback()?.impactOccurred(style);
  },
  /** An action completed successfully — task done, item created/saved. */
  success(): void {
    feedback()?.notificationOccurred("success");
  },
  /** An action failed — API error, validation failure. */
  error(): void {
    feedback()?.notificationOccurred("error");
  },
  /** A non-blocking heads-up — undo window, reversible warning. */
  warning(): void {
    feedback()?.notificationOccurred("warning");
  },
  /** A discrete value changed — picker scroll, segmented control, priority cycling. */
  selection(): void {
    feedback()?.selectionChanged();
  },
};
