import { supabase } from "../lib/supabase.js";
import type { Label } from "../types/index.js";

/** Raw task_labels table access. No business logic, no auth checks. */

export async function listLabelsForTask(taskId: string): Promise<Label[]> {
  const { data, error } = await supabase
    .from("task_labels")
    .select("label:labels(*)")
    .eq("task_id", taskId);

  if (error) throw error;
  return (data ?? []).map((row) => (row as unknown as { label: Label }).label).filter(Boolean);
}

/** Idempotent — attaching an already-attached label changes nothing. */
export async function attachLabel(taskId: string, labelId: string): Promise<void> {
  const { error } = await supabase
    .from("task_labels")
    .upsert({ task_id: taskId, label_id: labelId }, { onConflict: "task_id,label_id" });

  if (error) throw error;
}

/** Idempotent — detaching a label that isn't attached changes nothing. */
export async function detachLabel(taskId: string, labelId: string): Promise<void> {
  const { error } = await supabase.from("task_labels").delete().eq("task_id", taskId).eq("label_id", labelId);
  if (error) throw error;
}
