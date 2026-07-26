import { ERROR_CODES } from "@task-mini/shared";
import { supabase } from "../lib/supabase.js";
import { ApiError } from "../lib/apiError.js";
import type { Task, WorkspaceMember } from "../types/index.js";

/**
 * Central authorization checks. Routes must call these rather than
 * re-implementing membership/ownership queries, so a rule only ever changes
 * in one place.
 */

export async function getMembership(workspaceId: string, userId: string): Promise<WorkspaceMember | null> {
  const { data } = await supabase
    .from("workspace_members")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .maybeSingle();
  return (data as WorkspaceMember | null) ?? null;
}

/** Throws WORKSPACE_ACCESS_DENIED unless the user belongs to the workspace. */
export async function requireMembership(workspaceId: string, userId: string): Promise<WorkspaceMember> {
  const membership = await getMembership(workspaceId, userId);
  if (!membership) {
    throw new ApiError(ERROR_CODES.WORKSPACE_ACCESS_DENIED);
  }
  return membership;
}

/**
 * Membership plus a role above 'viewer'. Viewer is intentionally read-only,
 * so anything that changes workspace state (creating a task, being assigned
 * one) goes through this instead of requireMembership.
 */
export async function requireContributor(workspaceId: string, userId: string): Promise<WorkspaceMember> {
  const membership = await requireMembership(workspaceId, userId);
  if (membership.role === "viewer") {
    throw new ApiError(ERROR_CODES.WORKSPACE_ACCESS_DENIED, { message: "Роль «наблюдатель» доступна только для просмотра" });
  }
  return membership;
}

/**
 * Task creator, workspace owner, or workspace admin: may edit every field
 * and delete the task. 'manager' is deliberately not included here yet — it
 * has no distinct scope until project-level management exists to give it
 * one, so for now it behaves like a plain member (assignee-only rights).
 */
export async function canManageTask(task: Task, userId: string): Promise<boolean> {
  if (task.creator_id === userId) return true;
  const membership = await getMembership(task.workspace_id, userId);
  return membership?.role === "owner" || membership?.role === "admin";
}

export async function requireTaskManager(task: Task, userId: string): Promise<void> {
  if (!(await canManageTask(task, userId))) {
    throw new ApiError(ERROR_CODES.TASK_ACCESS_DENIED, {
      message: "Недостаточно прав для изменения задачи",
    });
  }
}

export interface TaskEditRights {
  /** May change any field. */
  canManage: boolean;
  /** Assignees who aren't managers may still move the task along. */
  canChangeStatus: boolean;
}

export async function getTaskEditRights(task: Task, userId: string): Promise<TaskEditRights> {
  await requireMembership(task.workspace_id, userId);

  const canManage = await canManageTask(task, userId);
  const isAssignee = task.assignee_id === userId;

  if (!canManage && !isAssignee) {
    throw new ApiError(ERROR_CODES.TASK_ACCESS_DENIED, {
      message: "Недостаточно прав для изменения задачи",
    });
  }

  return { canManage, canChangeStatus: true };
}

/** An assignee must themselves be a contributing member — not absent, not a viewer. */
export async function requireAssigneeIsMember(workspaceId: string, assigneeId: string): Promise<void> {
  const membership = await getMembership(workspaceId, assigneeId);
  if (!membership || membership.role === "viewer") {
    throw new ApiError(ERROR_CODES.ASSIGNEE_NOT_MEMBER);
  }
}
