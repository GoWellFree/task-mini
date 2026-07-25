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

export async function isWorkspaceOwner(workspaceId: string, userId: string): Promise<boolean> {
  const { data } = await supabase.from("workspaces").select("owner_id").eq("id", workspaceId).maybeSingle();
  return (data as { owner_id: string } | null)?.owner_id === userId;
}

/** Task creator or workspace owner: may edit every field and delete the task. */
export async function canManageTask(task: Task, userId: string): Promise<boolean> {
  if (task.creator_id === userId) return true;
  return isWorkspaceOwner(task.workspace_id, userId);
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

/** An assignee must themselves be a member of the task's workspace. */
export async function requireAssigneeIsMember(workspaceId: string, assigneeId: string): Promise<void> {
  if (!(await getMembership(workspaceId, assigneeId))) {
    throw new ApiError(ERROR_CODES.ASSIGNEE_NOT_MEMBER);
  }
}
