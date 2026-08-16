import { supabase } from "../lib/supabase.js";
import type { Task } from "../types/index.js";

/** Raw user_settings/users/user_digest_log access for the digest worker. No business logic. */

export interface DigestSettingsRow {
  userId: string;
  dailyDigestEnabled: boolean;
  dailyDigestTime: string;
  eveningDigestEnabled: boolean;
  quietHoursStart: string | null;
  quietHoursEnd: string | null;
  notificationsEnabled: boolean;
}

interface RawSettingsRow {
  user_id: string;
  daily_digest_enabled: boolean;
  daily_digest_time: string;
  evening_digest_enabled: boolean;
  quiet_hours_start: string | null;
  quiet_hours_end: string | null;
  telegram_notifications_enabled: boolean;
}

export async function listUsersWithAnyDigestEnabled(): Promise<DigestSettingsRow[]> {
  const { data, error } = await supabase
    .from("user_settings")
    .select(
      "user_id, daily_digest_enabled, daily_digest_time, evening_digest_enabled, quiet_hours_start, quiet_hours_end, telegram_notifications_enabled",
    )
    .or("daily_digest_enabled.eq.true,evening_digest_enabled.eq.true");
  if (error) throw error;

  return ((data ?? []) as RawSettingsRow[]).map((row) => ({
    userId: row.user_id,
    dailyDigestEnabled: row.daily_digest_enabled,
    dailyDigestTime: row.daily_digest_time,
    eveningDigestEnabled: row.evening_digest_enabled,
    quietHoursStart: row.quiet_hours_start,
    quietHoursEnd: row.quiet_hours_end,
    notificationsEnabled: row.telegram_notifications_enabled,
  }));
}

export interface UserTelegramInfo {
  telegramId: number;
  timezone: string;
}

export async function fetchTelegramInfo(userIds: string[]): Promise<Map<string, UserTelegramInfo>> {
  const map = new Map<string, UserTelegramInfo>();
  if (userIds.length === 0) return map;

  const { data, error } = await supabase.from("users").select("id, telegram_id, timezone").in("id", userIds);
  if (error) throw error;

  for (const row of (data ?? []) as { id: string; telegram_id: number; timezone: string }[]) {
    map.set(row.id, { telegramId: row.telegram_id, timezone: row.timezone });
  }
  return map;
}

/**
 * Candidate tasks for a digest: active, not finished, due before `beforeIso`.
 * Broad on purpose (across every workspace, no per-recipient timezone check)
 * — the same reasoning as `listActiveTasksDueWithin` for due-date reminders:
 * per-recipient local-time filtering happens in digestService against this
 * candidate set, since it can't be expressed as a single column comparison
 * when every recipient's timezone may differ.
 */
export async function listDigestCandidateTasks(beforeIso: string): Promise<Task[]> {
  const { data, error } = await supabase
    .from("tasks")
    .select("*")
    .is("deleted_at", null)
    .is("archived_at", null)
    .not("status", "in", "(done,cancelled)")
    .not("due_at", "is", null)
    .lt("due_at", beforeIso)
    .order("due_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as Task[];
}

/** Composite `user_id:digest_type:sent_on` keys already sent, for the given users, since `sinceIso`. */
export async function listAlreadySentDigests(userIds: string[], sinceIso: string): Promise<Set<string>> {
  if (userIds.length === 0) return new Set();

  const { data, error } = await supabase
    .from("user_digest_log")
    .select("user_id, digest_type, sent_on")
    .in("user_id", userIds)
    .gte("sent_at", sinceIso);
  if (error) throw error;

  return new Set(
    ((data ?? []) as { user_id: string; digest_type: string; sent_on: string }[]).map(
      (r) => `${r.user_id}:${r.digest_type}:${r.sent_on}`,
    ),
  );
}

/** Idempotent — recording an already-recorded (user, type, local date) triple changes nothing. */
export async function recordDigestSent(userId: string, digestType: "daily" | "evening", sentOnLocalDate: string): Promise<void> {
  const { error } = await supabase
    .from("user_digest_log")
    .upsert({ user_id: userId, digest_type: digestType, sent_on: sentOnLocalDate }, { onConflict: "user_id,digest_type,sent_on" });
  if (error) throw error;
}
