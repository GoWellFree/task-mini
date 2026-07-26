import * as taskAssigneeRepository from "../repositories/taskAssigneeRepository.js";
import { setAssigneeId } from "../repositories/taskRepository.js";

/**
 * Keeps tasks.assignee_id (the legacy single-assignee field, kept per the
 * spec until frontend fully migrates to the multi-assignee model) in step
 * with task_assignees, so both old and new readers see a consistent answer
 * throughout the transition.
 */

/** Used by the legacy single-assignee create/PATCH path: replaces the whole set with at most one person. */
export async function setSingleAssignee(taskId: string, userId: string | null, actingUserId: string): Promise<void> {
  await taskAssigneeRepository.clearAssignees(taskId);
  if (userId) {
    await taskAssigneeRepository.addAssignee(taskId, userId, actingUserId);
  }
  await setAssigneeId(taskId, userId);
}

/** Adds one more assignee without disturbing any existing ones. */
export async function addAssignee(taskId: string, userId: string, actingUserId: string): Promise<void> {
  await taskAssigneeRepository.addAssignee(taskId, userId, actingUserId);

  // Keep the legacy single field populated with *someone* if it was empty —
  // old readers should see a real assignee rather than none once one exists.
  const ids = await taskAssigneeRepository.listAssigneeIds(taskId);
  if (ids.length === 1) {
    await setAssigneeId(taskId, ids[0]!);
  }
}

/** Removes one assignee, reassigning the legacy single field if it pointed at them. */
export async function removeAssignee(taskId: string, userId: string, currentAssigneeId: string | null): Promise<void> {
  await taskAssigneeRepository.removeAssignee(taskId, userId);

  if (currentAssigneeId === userId) {
    const remaining = await taskAssigneeRepository.listAssigneeIds(taskId);
    await setAssigneeId(taskId, remaining[0] ?? null);
  }
}
