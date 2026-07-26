import { notifyTaskReminder } from "../lib/bot.js";
import * as reminderRepository from "../repositories/reminderRepository.js";
import { listActiveTasksDueWithin } from "../repositories/taskRepository.js";
import type { Task } from "../types/index.js";

/**
 * Matches user_settings.default_reminder_minutes's own max (7 days) — the
 * longest lead time any user could possibly have configured, so no
 * legitimate reminder falls outside this candidate window.
 */
const LOOKAHEAD_DAYS = 7;

export interface ReminderTickResult {
  tasksChecked: number;
  remindersSent: number;
}

/**
 * One tick of the reminder worker: finds active tasks due soon, works out
 * who should be reminded and whether it's their moment (due_at minus their
 * own default_reminder_minutes), sends what's due, and records it so the
 * next tick doesn't repeat it. `now` is injectable so tests don't depend on
 * real wall-clock time.
 */
export async function sendDueReminders(now: Date = new Date()): Promise<ReminderTickResult> {
  const cutoff = new Date(now.getTime() + LOOKAHEAD_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const tasks = await listActiveTasksDueWithin(cutoff);
  if (tasks.length === 0) return { tasksChecked: 0, remindersSent: 0 };

  const taskIds = tasks.map((t) => t.id);
  const [assigneesByTask, alreadyReminded] = await Promise.all([
    reminderRepository.listAssigneeIdsByTask(taskIds),
    reminderRepository.listAlreadyReminded(taskIds),
  ]);

  // Recipients are a task's assignees; a task nobody is assigned to falls
  // back to its creator, same as the rest of this codebase treats "who
  // should hear about this task" (see maybeNotifyAssignment).
  const candidates: { task: Task; userId: string }[] = [];
  for (const task of tasks) {
    const assigneeIds = assigneesByTask.get(task.id) ?? [];
    const recipientIds = assigneeIds.length > 0 ? assigneeIds : [task.creator_id];
    for (const userId of recipientIds) {
      if (!alreadyReminded.has(`${task.id}:${userId}`)) candidates.push({ task, userId });
    }
  }
  if (candidates.length === 0) return { tasksChecked: tasks.length, remindersSent: 0 };

  const recipientInfo = await reminderRepository.fetchRecipientInfo([...new Set(candidates.map((c) => c.userId))]);

  let remindersSent = 0;
  for (const { task, userId } of candidates) {
    const info = recipientInfo.get(userId);
    if (!info?.telegramId || !info.notificationsEnabled) continue;

    const dueAt = new Date(task.due_at!);
    const remindAt = new Date(dueAt.getTime() - info.reminderMinutes * 60 * 1000);
    if (now < remindAt || now >= dueAt) continue; // not yet due, or the window already passed

    // The send is best-effort and recorded regardless of outcome: a bad
    // telegram_id (blocked bot, deleted account) would otherwise retry —
    // and fail — on every single tick forever. A rare transient failure
    // costing one user one missed reminder is the cheaper failure mode,
    // consistent with how maybeNotifyAssignment treats notification
    // failures as non-critical elsewhere in this codebase.
    try {
      await notifyTaskReminder({ telegramId: info.telegramId, task });
    } catch (error) {
      console.error(`[reminderService] failed to notify user ${userId} for task ${task.id}:`, error);
    }
    await reminderRepository.recordReminderSent(task.id, userId);
    remindersSent++;
  }

  return { tasksChecked: tasks.length, remindersSent };
}
