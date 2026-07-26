import { supabase } from "../lib/supabase.js";
import type { ChecklistItem } from "../types/index.js";

/** Raw checklist_items table access. No business logic, no auth checks. */

export async function listForTask(taskId: string): Promise<ChecklistItem[]> {
  const { data, error } = await supabase
    .from("checklist_items")
    .select("*")
    .eq("task_id", taskId)
    .order("position", { ascending: true });

  if (error) throw error;
  return (data ?? []) as ChecklistItem[];
}

export async function getById(id: string): Promise<ChecklistItem | null> {
  const { data } = await supabase.from("checklist_items").select("*").eq("id", id).maybeSingle();
  return (data as ChecklistItem | null) ?? null;
}

export async function create(taskId: string, title: string): Promise<ChecklistItem> {
  const { data, error } = await supabase
    .from("checklist_items")
    .insert({ task_id: taskId, title })
    .select("*")
    .single();

  if (error || !data) throw error ?? new Error("Insert returned no row");
  return data as ChecklistItem;
}

/**
 * `isDone` and `completed_at` are kept as one atomic transition: checking an
 * item stamps when, unchecking clears it again, so completed_at never lags
 * or lingers stale the way tasks.completed_at deliberately avoids too.
 */
export async function update(
  id: string,
  updates: Partial<Pick<ChecklistItem, "title" | "position">> & { is_done?: boolean },
): Promise<ChecklistItem> {
  const patch: Partial<ChecklistItem> = { ...updates };
  if (updates.is_done !== undefined) {
    patch.completed_at = updates.is_done ? new Date().toISOString() : null;
  }

  const { data, error } = await supabase.from("checklist_items").update(patch).eq("id", id).select("*").single();

  if (error || !data) throw error ?? new Error("Update returned no row");
  return data as ChecklistItem;
}

export async function remove(id: string): Promise<void> {
  const { error } = await supabase.from("checklist_items").delete().eq("id", id);
  if (error) throw error;
}
