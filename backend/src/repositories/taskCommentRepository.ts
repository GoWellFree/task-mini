import { supabase } from "../lib/supabase.js";
import type { TaskComment, TaskCommentWithAuthor } from "../types/index.js";

/** Raw task_comments table access. No business logic, no auth checks. */

/**
 * Unlike task_assignees, task_comments has exactly one FK into users
 * (author_id), so this embed isn't ambiguous to PostgREST — no
 * !constraint_name disambiguation needed (see taskAssigneeRepository for
 * the case where one actually is).
 */
export async function listForTask(taskId: string): Promise<TaskCommentWithAuthor[]> {
  const { data, error } = await supabase
    .from("task_comments")
    .select("*, author:users(id, username, first_name, last_name, telegram_id)")
    .eq("task_id", taskId)
    .is("deleted_at", null)
    .order("created_at", { ascending: true });

  if (error) throw error;
  return (data ?? []) as unknown as TaskCommentWithAuthor[];
}

export async function getById(id: string): Promise<TaskComment | null> {
  const { data } = await supabase.from("task_comments").select("*").eq("id", id).is("deleted_at", null).maybeSingle();
  return (data as TaskComment | null) ?? null;
}

export async function create(
  taskId: string,
  authorId: string,
  body: string,
  parentCommentId: string | null,
): Promise<TaskComment> {
  const { data, error } = await supabase
    .from("task_comments")
    .insert({ task_id: taskId, author_id: authorId, body, parent_comment_id: parentCommentId })
    .select("*")
    .single();

  if (error || !data) throw error ?? new Error("Insert returned no row");
  return data as TaskComment;
}

export async function updateBody(id: string, body: string): Promise<TaskComment> {
  const { data, error } = await supabase
    .from("task_comments")
    .update({ body, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("*")
    .single();

  if (error || !data) throw error ?? new Error("Update returned no row");
  return data as TaskComment;
}

/** Soft delete — the row (and any replies pointing at it) stays for referential integrity, just hidden. */
export async function softDelete(id: string): Promise<void> {
  const { error } = await supabase
    .from("task_comments")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    .is("deleted_at", null);

  if (error) throw error;
}
