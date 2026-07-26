import { supabase } from "../lib/supabase.js";
import type { UserSettings } from "../types/index.js";

/** Raw user_settings table access. No business logic, no auth checks. */

const DEFAULTS: Omit<UserSettings, "user_id" | "created_at" | "updated_at"> = {
  default_workspace_id: null,
  default_reminder_minutes: 30,
  week_starts_on: 1,
  daily_digest_enabled: false,
  daily_digest_time: "09:00",
  evening_digest_enabled: false,
  quiet_hours_start: null,
  quiet_hours_end: null,
  telegram_notifications_enabled: true,
  theme: "system",
};

/**
 * Settings are optional by design (onboarding creates a row, but nothing
 * else requires one to exist) — a user with none yet just gets defaults
 * rather than a 404, so a partially-failed onboarding or a user who predates
 * this table degrades gracefully instead of breaking their settings screen.
 */
export async function getSettingsOrDefaults(userId: string): Promise<UserSettings> {
  const { data } = await supabase.from("user_settings").select("*").eq("user_id", userId).maybeSingle();
  if (data) return data as UserSettings;

  const now = new Date().toISOString();
  return { user_id: userId, created_at: now, updated_at: now, ...DEFAULTS };
}

export async function createDefaultSettings(userId: string, defaultWorkspaceId: string | null): Promise<void> {
  const { error } = await supabase
    .from("user_settings")
    .insert({ user_id: userId, default_workspace_id: defaultWorkspaceId });

  if (error) throw error;
}

export async function upsertSettings(
  userId: string,
  patch: Partial<Omit<UserSettings, "user_id" | "created_at" | "updated_at">>,
): Promise<UserSettings> {
  // Deliberately NOT spreading DEFAULTS in here: upsert's ON CONFLICT DO
  // UPDATE replaces exactly the columns given, so doing that would reset
  // every field the caller didn't touch back to its default on each partial
  // update. Omitted columns fall back to the table's own DEFAULT only on a
  // genuine first insert; an existing row keeps its other values untouched.
  const { data, error } = await supabase
    .from("user_settings")
    .upsert({ user_id: userId, ...patch, updated_at: new Date().toISOString() }, { onConflict: "user_id" })
    .select("*")
    .single();

  if (error || !data) throw error ?? new Error("Upsert returned no row");
  return data as UserSettings;
}
