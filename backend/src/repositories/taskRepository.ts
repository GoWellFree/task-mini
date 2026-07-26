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

export interface ListTasksOptions {
  /** Free-text search against title (weight A) + description (weight B). */
  search?: string;
  projectId?: string;
  status?: TaskStatus;
  priority?: Task["priority"];
  /** Matches the full task_assignees set, not just the legacy assignee_id mirror. */
  assigneeId?: string;
  /** The task's creator (tasks.creator_id) — "author" in the spec's terms. */
  authorId?: string;
  labelId?: string;
  dueBefore?: string;
  dueAfter?: string;
}

/**
 * Escapes a raw search term for safe use inside PostgREST's or() filter DSL:
 * `%`/`_` are neutralized so ILIKE treats them as literal characters (not
 * wildcards), and the whole value is then quoted per PostgREST's own
 * convention so a `,`/`(`/`)` in the search text can't be parsed as
 * filter-DSL structure (which .or() — unlike a lone .ilike() — otherwise
 * would, since commas/parens are its group/list separators).
 */
function toQuotedIlikePattern(term: string): string {
  const escapedForLike = term.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
  const pattern = `%${escapedForLike}%`;
  return `"${pattern.replace(/"/g, '\\"')}"`;
}

/**
 * assigneeId/labelId live in join tables (task_assignees/task_labels), not
 * on tasks itself, so they resolve to an id allow-list applied via .in("id",
 * ...) rather than a plain .eq(). undefined means "no restriction from
 * these two filters"; a defined-but-empty array means "no task can
 * possibly match", which the caller short-circuits on before querying
 * tasks at all.
 */
async function resolveAllowedTaskIds(options: ListTasksOptions): Promise<string[] | undefined> {
  const [assigneeTaskIds, labelTaskIds] = await Promise.all([
    options.assigneeId ? listTaskIdsForAssignee(options.assigneeId) : undefined,
    options.labelId ? listTaskIdsForLabel(options.labelId) : undefined,
  ]);

  if (assigneeTaskIds && labelTaskIds) {
    const labelSet = new Set(labelTaskIds);
    return assigneeTaskIds.filter((id) => labelSet.has(id));
  }
  return assigneeTaskIds ?? labelTaskIds;
}

async function listTaskIdsForAssignee(userId: string): Promise<string[]> {
  const { data, error } = await supabase.from("task_assignees").select("task_id").eq("user_id", userId);
  if (error) throw error;
  return (data ?? []).map((row) => (row as { task_id: string }).task_id);
}

async function listTaskIdsForLabel(labelId: string): Promise<string[]> {
  const { data, error } = await supabase.from("task_labels").select("task_id").eq("label_id", labelId);
  if (error) throw error;
  return (data ?? []).map((row) => (row as { task_id: string }).task_id);
}

type TasksFilterBuilder = ReturnType<ReturnType<typeof supabase.from>["select"]>;

/** The scalar (same-table, single-value) filters shared by all three query variants below. */
function applyScalarFilters(
  query: TasksFilterBuilder,
  options: ListTasksOptions,
  allowedIds: string[] | undefined,
): TasksFilterBuilder {
  let q = query;
  if (options.projectId) q = q.eq("project_id", options.projectId);
  if (options.status) q = q.eq("status", options.status);
  if (options.priority) q = q.eq("priority", options.priority);
  if (options.authorId) q = q.eq("creator_id", options.authorId);
  if (options.dueBefore) q = q.lte("due_at", options.dueBefore);
  if (options.dueAfter) q = q.gte("due_at", options.dueAfter);
  if (allowedIds) q = q.in("id", allowedIds);
  return q;
}

export async function listTasksForWorkspace(workspaceId: string, options: ListTasksOptions = {}): Promise<Task[]> {
  const allowedIds = await resolveAllowedTaskIds(options);
  if (allowedIds && allowedIds.length === 0) return [];

  const search = options.search?.trim();
  if (search) {
    const ftsMatches = await searchTasksByFts(workspaceId, search, options, allowedIds);
    if (ftsMatches.length > 0) return ftsMatches;
    return searchTasksByTrigram(workspaceId, search, options, allowedIds);
  }

  const query = applyScalarFilters(
    supabase.from("tasks").select("*").eq("workspace_id", workspaceId).is("deleted_at", null),
    options,
    allowedIds,
  );
  const { data, error } = await query.order("created_at", { ascending: false });

  if (error) throw error;
  return (data ?? []) as Task[];
}

async function searchTasksByFts(
  workspaceId: string,
  search: string,
  options: ListTasksOptions,
  allowedIds: string[] | undefined,
): Promise<Task[]> {
  const query = applyScalarFilters(
    supabase
      .from("tasks")
      .select("*")
      .eq("workspace_id", workspaceId)
      .is("deleted_at", null)
      .textSearch("search_vector", search, { type: "websearch", config: "russian" }),
    options,
    allowedIds,
  );
  const { data, error } = await query.order("created_at", { ascending: false });

  if (error) throw error;
  return (data ?? []) as Task[];
}

/**
 * Fallback when FTS finds nothing: pg_trgm accelerates ILIKE so this stays
 * fast, and catches substrings/typos that don't align to FTS's word/lexeme
 * boundaries (e.g. "молок" as a mid-word fragment, or a plain misspelling).
 */
async function searchTasksByTrigram(
  workspaceId: string,
  search: string,
  options: ListTasksOptions,
  allowedIds: string[] | undefined,
): Promise<Task[]> {
  const pattern = toQuotedIlikePattern(search);
  const query = applyScalarFilters(
    supabase
      .from("tasks")
      .select("*")
      .eq("workspace_id", workspaceId)
      .is("deleted_at", null)
      .or(`title.ilike.${pattern},description.ilike.${pattern}`),
    options,
    allowedIds,
  );
  const { data, error } = await query.order("created_at", { ascending: false });

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

/**
 * Mirrors tasks.assignee_id to reflect the current task_assignees set, for
 * callers that predate multiple assignees (see taskAssignmentService).
 * Deliberately does not go through the optimistic-locking path: this is a
 * side effect of an assignment change, not a competing edit to the fields
 * that flow guards, and requiring every caller to carry a task version
 * would make simple assign/unassign calls needlessly heavy.
 */
export async function setAssigneeId(id: string, assigneeId: string | null): Promise<void> {
  const { error } = await supabase
    .from("tasks")
    .update({ assignee_id: assigneeId, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) throw error;
}
