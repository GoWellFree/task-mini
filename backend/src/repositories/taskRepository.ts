import { supabase } from "../lib/supabase.js";
import type { Task, TaskStatus, TaskWithWorkspace } from "../types/index.js";

/** Raw tasks table access. No business logic, no auth checks. */

/** A soft-deleted task does not exist as far as any normal read is concerned. */
export async function getActiveTaskById(id: string): Promise<Task | null> {
  const { data } = await supabase.from("tasks").select("*").eq("id", id).is("deleted_at", null).maybeSingle();
  return (data as Task | null) ?? null;
}

export async function listTasksAssignedToUser(userId: string): Promise<TaskWithWorkspace[]> {
  const { data, error } = await supabase
    .from("tasks")
    .select("*, workspace:workspaces(name)")
    .eq("assignee_id", userId)
    .is("deleted_at", null)
    .order("due_at", { ascending: true, nullsFirst: false });

  if (error) throw error;
  return (data ?? []) as unknown as TaskWithWorkspace[];
}

export async function listTasksForWorkspace(workspaceId: string): Promise<Task[]> {
  const { data, error } = await supabase
    .from("tasks")
    .select("*")
    .eq("workspace_id", workspaceId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data ?? []) as Task[];
}

export interface NewTaskInput {
  workspace_id: string;
  title: string;
  description: string | null;
  creator_id: string;
  assignee_id: string | null;
  status?: TaskStatus;
  due_at: string | null;
  project_id?: string | null;
  parent_task_id?: string | null;
  priority?: Task["priority"];
  start_at?: string | null;
  estimate_minutes?: number | null;
}

export async function createTask(input: NewTaskInput): Promise<Task> {
  const { data, error } = await supabase
    .from("tasks")
    .insert({ ...input, status: input.status ?? "todo" })
    .select("*")
    .single();

  if (error || !data) throw error ?? new Error("Insert returned no row");
  return data as Task;
}

const MAX_PARENT_CHAIN_DEPTH = 50;

/**
 * Would setting `task.parent_task_id = newParentId` create a cycle? True for
 * the trivial self-parent case, and for the general case where `taskId` is
 * already an ancestor of `newParentId` — walking up newParentId's own parent
 * chain and finding taskId means newParentId is presently reachable by
 * walking down FROM taskId, so linking it back the other way would close a
 * loop. Bounded rather than recursive without limit, in case of any
 * pre-existing bad data.
 */
export async function wouldCreateCycle(taskId: string, newParentId: string): Promise<boolean> {
  if (taskId === newParentId) return true;

  let currentId: string | null = newParentId;
  for (let i = 0; i < MAX_PARENT_CHAIN_DEPTH && currentId !== null; i++) {
    const result = await supabase.from("tasks").select("parent_task_id").eq("id", currentId).maybeSingle();
    const row = result.data as { parent_task_id: string | null } | null;
    const parentId: string | null = row?.parent_task_id ?? null;
    if (parentId === taskId) return true;
    currentId = parentId;
  }
  return false;
}

export async function listSubtasks(parentTaskId: string): Promise<Task[]> {
  const { data, error } = await supabase
    .from("tasks")
    .select("*")
    .eq("parent_task_id", parentTaskId)
    .is("deleted_at", null)
    .order("position", { ascending: true });

  if (error) throw error;
  return (data ?? []) as Task[];
}

export type VersionedUpdateResult =
  | { ok: true; task: Task }
  | { ok: false; reason: "version_conflict" };

/**
 * Updates a task only if its version still matches what the caller last
 * read, incrementing it atomically in the same statement. If another
 * request updated the row in between the caller's read and this call, zero
 * rows match the `eq("version", ...)` filter and this reports a conflict
 * instead of silently overwriting the concurrent change.
 */
export async function updateTaskWithVersionCheck(
  id: string,
  expectedVersion: number,
  updates: Partial<Task>,
): Promise<VersionedUpdateResult> {
  const { data, error } = await supabase
    .from("tasks")
    .update({ ...updates, version: expectedVersion + 1, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("version", expectedVersion)
    .is("deleted_at", null)
    .select("*")
    .maybeSingle();

  if (error) throw error;
  if (!data) return { ok: false, reason: "version_conflict" };
  return { ok: true, task: data as Task };
}

/** Marks a task deleted without removing the row. Idempotent. */
export async function softDeleteTask(id: string): Promise<void> {
  const { error } = await supabase
    .from("tasks")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    .is("deleted_at", null);

  if (error) throw error;
}
