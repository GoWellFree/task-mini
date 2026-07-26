import { supabase } from "../lib/supabase.js";

/** Raw task_assignees/user_settings/users/task_reminders access for the reminder worker. No business logic. */

/** Task ids grouped by their assignee user ids, for the given tasks only. Tasks with no row here have no assignees. */
export async function listAssigneeIdsByTask(taskIds: string[]): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  if (taskIds.length === 0) return map;

  const { data, error } = await supabase.from("task_assignees").select("task_id, user_id").in("task_id", taskIds);
  if (error) throw error;

  for (const row of (data ?? []) as { task_id: string; user_id: string }[]) {
    const existing = map.get(row.task_id);
    if (existing) existing.push(row.user_id);
    else map.set(row.task_id, [row.user_id]);
  }
  return map;
}

export interface ReminderRecipientInfo {
  telegramId: number | null;
  /** Falls back to the user_settings column default when the user has no settings row yet. */
  reminderMinutes: number;
  notificationsEnabled: boolean;
}

const DEFAULT_REMINDER_MINUTES = 30;
const DEFAULT_NOTIFICATIONS_ENABLED = true;

/** Batches the two lookups every recipient needs (telegram_id, reminder settings) into one round trip each. */
export async function fetchRecipientInfo(userIds: string[]): Promise<Map<string, ReminderRecipientInfo>> {
  const map = new Map<string, ReminderRecipientInfo>();
  if (userIds.length === 0) return map;

  const [usersResult, settingsResult] = await Promise.all([
    supabase.from("users").select("id, telegram_id").in("id", userIds),
    supabase
      .from("user_settings")
      .select("user_id, default_reminder_minutes, telegram_notifications_enabled")
      .in("user_id", userIds),
  ]);
  if (usersResult.error) throw usersResult.error;
  if (settingsResult.error) throw settingsResult.error;

  const settingsByUser = new Map(
    ((settingsResult.data ?? []) as { user_id: string; default_reminder_minutes: number; telegram_notifications_enabled: boolean }[]).map(
      (s) => [s.user_id, s],
    ),
  );

  for (const user of (usersResult.data ?? []) as { id: string; telegram_id: number }[]) {
    const settings = settingsByUser.get(user.id);
    map.set(user.id, {
      telegramId: user.telegram_id,
      reminderMinutes: settings?.default_reminder_minutes ?? DEFAULT_REMINDER_MINUTES,
      notificationsEnabled: settings?.telegram_notifications_enabled ?? DEFAULT_NOTIFICATIONS_ENABLED,
    });
  }
  return map;
}

/** Composite (task_id, user_id) keys already reminded, for the given tasks only. */
export async function listAlreadyReminded(taskIds: string[]): Promise<Set<string>> {
  if (taskIds.length === 0) return new Set();

  const { data, error } = await supabase.from("task_reminders").select("task_id, user_id").in("task_id", taskIds);
  if (error) throw error;
  return new Set(((data ?? []) as { task_id: string; user_id: string }[]).map((r) => `${r.task_id}:${r.user_id}`));
}

/** Idempotent — recording an already-recorded (task, user) pair changes nothing. */
export async function recordReminderSent(taskId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from("task_reminders")
    .upsert({ task_id: taskId, user_id: userId }, { onConflict: "task_id,user_id" });
  if (error) throw error;
}

/**
 * Clears every recorded reminder for a task. Called when a recurring task
 * rolls to its next occurrence: task_reminders is keyed by task_id, and the
 * roll reuses the same row/id, so without this a task's very first
 * occurrence would permanently block reminders for every occurrence after
 * it.
 */
export async function clearRemindersForTask(taskId: string): Promise<void> {
  const { error } = await supabase.from("task_reminders").delete().eq("task_id", taskId);
  if (error) throw error;
}
