import { env } from "../lib/env.js";
import { sendDueReminders } from "../services/reminderService.js";

/** Reminders/recurrence are minute-granularity concepts; a minute tick is fine-grained enough without being wasteful. */
const TICK_INTERVAL_MS = 60_000;

let intervalHandle: NodeJS.Timeout | undefined;
let ticking = false;

async function tick(): Promise<void> {
  if (ticking) return; // the previous tick is still running (slow DB, etc.) — skip rather than overlap
  ticking = true;
  try {
    await sendDueReminders();
  } catch (error) {
    console.error("[reminderWorker] tick failed:", error);
  } finally {
    ticking = false;
  }
}

/**
 * Starts the in-process reminder/recurrence worker: one tick immediately
 * (so a fresh deploy doesn't wait a full interval for its first check),
 * then every TICK_INTERVAL_MS after that. Never runs during tests — same
 * reasoning as bot polling in lib/bot.ts: a background timer must not
 * outlive the test that started it.
 */
export function startReminderWorker(): void {
  if (env.isTest) return;
  void tick();
  intervalHandle = setInterval(() => void tick(), TICK_INTERVAL_MS);
}

export function stopReminderWorker(): void {
  if (intervalHandle) clearInterval(intervalHandle);
  intervalHandle = undefined;
}
