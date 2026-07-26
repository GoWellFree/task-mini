import { supabase } from "../lib/supabase.js";
import type { TaskAssigneeWithUser } from "../types/index.js";

/** Raw task_assignees table access. No business logic, no auth checks. */

export async function listAssignees(taskId: string): Promise<TaskAssigneeWithUser[]> {
  // task_assignees has two FKs into users (user_id, assigned_by), so the
  // embed target must be disambiguated by constraint name — PostgREST
  // otherwise refuses the query as ambiguous (PGRST201).
  const { data, error } = await supabase
    .from("task_assignees")
    .select("*, user:users!task_assignees_user_id_fkey(id, username, first_name, last_name, telegram_id)")
    .eq("task_id", taskId)
    .order("assigned_at", { ascending: true });

  if (error) throw error;
  return (data ?? []) as unknown as TaskAssigneeWithUser[];
}

export async function listAssigneeIds(taskId: string): Promise<string[]> {
  const { data, error } = await supabase.from("task_assignees").select("user_id").eq("task_id", taskId);
  if (error) throw error;
  return (data ?? []).map((row) => (row as { user_id: string }).user_id);
}

/** Idempotent — adding someone already assigned changes nothing. */
export async function addAssignee(taskId: string, userId: string, assignedBy: string): Promise<void> {
  const { error } = await supabase
    .from("task_assignees")
    .upsert({ task_id: taskId, user_id: userId, assigned_by: assignedBy }, { onConflict: "task_id,user_id" });

  if (error) throw error;
}

/** Idempotent — removing someone not assigned changes nothing. */
export async function removeAssignee(taskId: string, userId: string): Promise<void> {
  const { error } = await supabase.from("task_assignees").delete().eq("task_id", taskId).eq("user_id", userId);
  if (error) throw error;
}

export async function clearAssignees(taskId: string): Promise<void> {
  const { error } = await supabase.from("task_assignees").delete().eq("task_id", taskId);
  if (error) throw error;
}
