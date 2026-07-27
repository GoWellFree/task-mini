import { supabase } from "../lib/supabase.js";
import type { Task } from "../types/index.js";

/** Raw task_dependencies table access. No business logic, no auth checks. */

type DependencyTaskInfo = Pick<Task, "id" | "title" | "status">;

/** Tasks this one depends on (is blocked by) — the "blocked by" direction. */
export async function listDependencies(taskId: string): Promise<DependencyTaskInfo[]> {
  const { data, error } = await supabase
    .from("task_dependencies")
    .select("depends_on:tasks!task_dependencies_depends_on_task_id_fkey(id, title, status)")
    .eq("task_id", taskId);

  if (error) throw error;
  return ((data ?? []) as unknown as { depends_on: DependencyTaskInfo }[]).map((row) => row.depends_on);
}

/** Tasks that depend on this one — the "blocks" direction. */
export async function listDependents(taskId: string): Promise<DependencyTaskInfo[]> {
  const { data, error } = await supabase
    .from("task_dependencies")
    .select("task:tasks!task_dependencies_task_id_fkey(id, title, status)")
    .eq("depends_on_task_id", taskId);

  if (error) throw error;
  return ((data ?? []) as unknown as { task: DependencyTaskInfo }[]).map((row) => row.task);
}

/** Idempotent — adding an already-recorded dependency changes nothing. */
export async function addDependency(taskId: string, dependsOnTaskId: string): Promise<void> {
  const { error } = await supabase
    .from("task_dependencies")
    .upsert({ task_id: taskId, depends_on_task_id: dependsOnTaskId }, { onConflict: "task_id,depends_on_task_id" });
  if (error) throw error;
}

/** Idempotent — removing one that isn't recorded changes nothing. */
export async function removeDependency(taskId: string, dependsOnTaskId: string): Promise<void> {
  const { error } = await supabase
    .from("task_dependencies")
    .delete()
    .eq("task_id", taskId)
    .eq("depends_on_task_id", dependsOnTaskId);
  if (error) throw error;
}

const MAX_GRAPH_DEPTH = 100;

/**
 * Would `taskId` depending on `dependsOnTaskId` create a cycle? True exactly
 * when `taskId` is already reachable by walking FORWARD from
 * `dependsOnTaskId` through the existing depends_on edges — if it is, this
 * new edge would close a loop back to where the walk started. Breadth-first
 * over the whole graph (not just a single chain, unlike the parent_task_id
 * tree walk) since a task can depend on several others; bounded rather than
 * unbounded in case of any pre-existing bad data.
 */
export async function wouldCreateCycle(taskId: string, dependsOnTaskId: string): Promise<boolean> {
  if (taskId === dependsOnTaskId) return true;

  let frontier = [dependsOnTaskId];
  const visited = new Set<string>(frontier);

  for (let depth = 0; depth < MAX_GRAPH_DEPTH && frontier.length > 0; depth++) {
    const { data, error } = await supabase
      .from("task_dependencies")
      .select("depends_on_task_id")
      .in("task_id", frontier);
    if (error) throw error;

    const next: string[] = [];
    for (const row of (data ?? []) as { depends_on_task_id: string }[]) {
      if (row.depends_on_task_id === taskId) return true;
      if (!visited.has(row.depends_on_task_id)) {
        visited.add(row.depends_on_task_id);
        next.push(row.depends_on_task_id);
      }
    }
    frontier = next;
  }
  return false;
}

/** Whether every task this one depends on is already done — gates completing it. */
export async function areDependenciesResolved(taskId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("task_dependencies")
    .select("depends_on:tasks!task_dependencies_depends_on_task_id_fkey(status)")
    .eq("task_id", taskId);
  if (error) throw error;

  return ((data ?? []) as unknown as { depends_on: { status: string } }[]).every(
    (row) => row.depends_on.status === "done",
  );
}
