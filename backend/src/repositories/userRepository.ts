import { supabase } from "../lib/supabase.js";
import type { User } from "../types/index.js";

/** Raw users table access. No business logic, no auth checks. */

export async function findUserById(id: string): Promise<User | null> {
  const { data } = await supabase.from("users").select("*").eq("id", id).maybeSingle();
  return (data as User | null) ?? null;
}

export async function findUserByTelegramId(telegramId: number): Promise<User | null> {
  const { data } = await supabase.from("users").select("*").eq("telegram_id", telegramId).maybeSingle();
  return (data as User | null) ?? null;
}

/**
 * Upsert instead of plain insert: if two requests race to create the same
 * telegram_id (e.g. React StrictMode double-invoking the auth call in dev),
 * this resolves the conflict instead of throwing a duplicate-key error.
 */
export async function upsertUserByTelegramId(input: {
  telegram_id: number;
  username?: string;
  first_name: string;
  last_name?: string;
}): Promise<User> {
  const { data, error } = await supabase
    .from("users")
    .upsert(
      {
        telegram_id: input.telegram_id,
        username: input.username ?? null,
        first_name: input.first_name,
        last_name: input.last_name ?? null,
      },
      { onConflict: "telegram_id" },
    )
    .select("*")
    .single();

  if (error || !data) throw error ?? new Error("Upsert returned no row");
  return data as User;
}

export async function updateUser(id: string, patch: Partial<Pick<User, "timezone">>): Promise<User> {
  const { data, error } = await supabase
    .from("users")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("*")
    .single();

  if (error || !data) throw error ?? new Error("Update returned no row");
  return data as User;
}
