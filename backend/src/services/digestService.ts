import { notifyDigest } from "../lib/bot.js";
import { getLocalTimeParts, isWithinQuietHours, localDayBoundsUtc, matchesTimeOfDay } from "../lib/timezone.js";
import * as digestRepository from "../repositories/digestRepository.js";
import { listAssigneeIdsByTask } from "../repositories/reminderRepository.js";
import type { Task } from "../types/index.js";

/** user_settings has no per-user evening-digest time column, unlike daily_digest_time — fixed by design. */
const EVENING_DIGEST_HOUR = 18;

/**
 * Widest possible margin for "due today" across any real-world timezone
 * (UTC-12 to UTC+14 is a 26h spread) — over-fetches candidates slightly
 * rather than risk missing one, since the precise per-recipient cutoff is
 * applied afterward using each recipient's own timezone.
 */
const LOOKAHEAD_MS = 26 * 60 * 60 * 1000;

/** How far back to check for an already-sent digest, comfortably wider than one calendar day in any timezone. */
const ALREADY_SENT_LOOKBACK_MS = 48 * 60 * 60 * 1000;

export interface DigestTickResult {
  usersChecked: number;
  digestsSent: number;
}

/**
 * One tick of the digest worker: for every user with a daily and/or evening
 * digest enabled, works out (in their own local time) whether it's their
 * moment, whether they're in quiet hours, and — if there's anything to
 * report — sends it. `now` is injectable so tests don't depend on real
 * wall-clock time.
 */
export async function sendDueDigests(now: Date = new Date()): Promise<DigestTickResult> {
  const settingsRows = await digestRepository.listUsersWithAnyDigestEnabled();
  if (settingsRows.length === 0) return { usersChecked: 0, digestsSent: 0 };

  const userIds = settingsRows.map((s) => s.userId);
  const [telegramInfoByUser, alreadySent, candidateTasks] = await Promise.all([
    digestRepository.fetchTelegramInfo(userIds),
    digestRepository.listAlreadySentDigests(userIds, new Date(now.getTime() - ALREADY_SENT_LOOKBACK_MS).toISOString()),
    digestRepository.listDigestCandidateTasks(new Date(now.getTime() + LOOKAHEAD_MS).toISOString()),
  ]);

  const assigneesByTask = await listAssigneeIdsByTask(candidateTasks.map((t) => t.id));

  // Recipients are a task's assignees; a task nobody is assigned to falls
  // back to its creator — same convention as the due-date reminder worker.
  const tasksByUser = new Map<string, Task[]>();
  for (const task of candidateTasks) {
    const assigneeIds = assigneesByTask.get(task.id) ?? [];
    const recipientIds = assigneeIds.length > 0 ? assigneeIds : [task.creator_id];
    for (const userId of recipientIds) {
      const list = tasksByUser.get(userId);
      if (list) list.push(task);
      else tasksByUser.set(userId, [task]);
    }
  }

  let digestsSent = 0;
  for (const settings of settingsRows) {
    const info = telegramInfoByUser.get(settings.userId);
    if (!info?.telegramId || !settings.notificationsEnabled) continue;

    const { dateStr, hours, minutes } = getLocalTimeParts(now, info.timezone);
    if (isWithinQuietHours(hours, minutes, settings.quietHoursStart, settings.quietHoursEnd)) continue;

    const kinds: Array<"daily" | "evening"> = [];
    if (settings.dailyDigestEnabled && matchesTimeOfDay(hours, minutes, settings.dailyDigestTime)) kinds.push("daily");
    if (settings.eveningDigestEnabled && hours === EVENING_DIGEST_HOUR && minutes === 0) kinds.push("evening");
    if (kinds.length === 0) continue;

    const userTasks = tasksByUser.get(settings.userId) ?? [];
    const { start, end } = localDayBoundsUtc(dateStr, info.timezone);
    const overdue = userTasks.filter((t) => new Date(t.due_at!) < now);
    const dueToday = userTasks.filter((t) => {
      const due = new Date(t.due_at!);
      return due >= now && due >= start && due < end;
    });
    if (overdue.length === 0 && dueToday.length === 0) continue; // nothing to report — don't send an empty digest

    for (const kind of kinds) {
      if (alreadySent.has(`${settings.userId}:${kind}:${dateStr}`)) continue;

      // Best-effort, same as the reminder worker: a bad telegram_id must not
      // retry — and fail — on every tick forever.
      try {
        await notifyDigest({ telegramId: info.telegramId, kind, overdue, dueToday });
      } catch (error) {
        console.error(`[digestService] failed to notify user ${settings.userId} (${kind}):`, error);
      }
      await digestRepository.recordDigestSent(settings.userId, kind, dateStr);
      digestsSent++;
    }
  }

  return { usersChecked: settingsRows.length, digestsSent };
}
