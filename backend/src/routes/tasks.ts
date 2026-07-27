import { Router } from "express";
import {
  ERROR_CODES,
  addAssigneeSchema,
  addDependencySchema,
  attachLabelSchema,
  createChecklistItemSchema,
  createCommentSchema,
  createTaskSchema,
  taskAssigneeParamSchema,
  taskChecklistItemParamSchema,
  taskCommentParamSchema,
  taskDependencyParamSchema,
  taskLabelParamSchema,
  taskListQuerySchema,
  updateChecklistItemSchema,
  updateCommentSchema,
  updateTaskSchema,
  uuidParamSchema,
  workspaceIdParamSchema,
  type AddAssigneeInput,
  type AddDependencyInput,
  type AttachLabelInput,
  type CreateChecklistItemInput,
  type CreateCommentInput,
  type CreateTaskInput,
  type TaskListQuery,
  type UpdateChecklistItemInput,
  type UpdateCommentInput,
  type UpdateTaskInput,
} from "@task-mini/shared";
import { ApiError } from "../lib/apiError.js";
import { requireAuth } from "../middleware/auth.js";
import { asyncHandler, validateBody, validateParams, validateQuery } from "../middleware/validate.js";
import {
  getTaskEditRights,
  requireAssigneeIsMember,
  requireContributor,
  requireMembership,
  requireTaskManager,
} from "../permissions/workspacePermissions.js";
import {
  createTask,
  getActiveTaskById,
  listSubtasks,
  listTasksAssignedToUser,
  listTasksForWorkspace,
  softDeleteTask,
  updateTaskWithVersionCheck,
  wouldCreateCycle,
} from "../repositories/taskRepository.js";
import { listAssignees } from "../repositories/taskAssigneeRepository.js";
import { attachLabel, detachLabel, listLabelsForTask } from "../repositories/taskLabelRepository.js";
import { getLabelById } from "../repositories/labelRepository.js";
import * as checklistItemRepository from "../repositories/checklistItemRepository.js";
import * as taskCommentRepository from "../repositories/taskCommentRepository.js";
import * as taskDependencyRepository from "../repositories/taskDependencyRepository.js";
import { getProjectById } from "../repositories/projectRepository.js";
import { findUserById } from "../repositories/userRepository.js";
import { getWorkspaceById } from "../repositories/workspaceRepository.js";
import * as reminderRepository from "../repositories/reminderRepository.js";
import * as taskAssignmentService from "../services/taskAssignmentService.js";
import { applyRecurrenceOnCompletion } from "../services/recurrenceService.js";
import { notifyTaskAssigned } from "../lib/bot.js";
import type { Task } from "../types/index.js";

export const tasksRouter = Router();
tasksRouter.use(requireAuth);

async function getTaskOrThrow(taskId: string): Promise<Task> {
  const task = await getActiveTaskById(taskId);
  if (!task) {
    throw new ApiError(ERROR_CODES.TASK_NOT_FOUND);
  }
  return task;
}

/**
 * Checking off a checklist item is "making progress on the task", the same
 * spirit as an assignee being allowed to move the task's own status along —
 * getTaskEditRights already grants that to a manager or any of the task's
 * (possibly several) assignees and throws for anyone else, which is exactly
 * the rule wanted here too. Structural edits (add/rename/reorder/delete an
 * item) are NOT covered by this and stay behind requireTaskManager, same as
 * the task's other non-status fields.
 */
async function canToggleChecklist(task: Task, userId: string): Promise<boolean> {
  try {
    await getTaskEditRights(task, userId);
    return true;
  } catch {
    return false;
  }
}

/** A project can only be attached to tasks in the same workspace it belongs to. */
async function requireProjectInWorkspace(workspaceId: string, projectId: string): Promise<void> {
  const project = await getProjectById(projectId);
  if (!project || project.workspace_id !== workspaceId) {
    throw new ApiError(ERROR_CODES.PROJECT_NOT_FOUND);
  }
}

/** A parent task must exist, be in the same workspace, and not create a cycle. */
async function requireValidParent(workspaceId: string, taskId: string | null, parentTaskId: string): Promise<void> {
  const parent = await getActiveTaskById(parentTaskId);
  if (!parent || parent.workspace_id !== workspaceId) {
    throw new ApiError(ERROR_CODES.TASK_NOT_FOUND, { message: "Родительская задача не найдена" });
  }
  if (taskId && (await wouldCreateCycle(taskId, parentTaskId))) {
    throw new ApiError(ERROR_CODES.VALIDATION_FAILED, {
      message: "Нельзя сделать задачу подзадачей самой себя или своего потомка",
    });
  }
}

// GET /api/tasks/my — tasks assigned to the current user, across all workspaces
tasksRouter.get(
  "/my",
  asyncHandler(async (req, res) => {
    const tasks = await listTasksAssignedToUser(req.user!.id);
    res.json({ tasks });
  }),
);

// GET /api/tasks/:id
tasksRouter.get(
  "/:id",
  validateParams(uuidParamSchema),
  asyncHandler(async (req, res) => {
    const task = await getTaskOrThrow(req.params.id as string);
    await requireMembership(task.workspace_id, req.user!.id);
    res.json({ task });
  }),
);

// GET /api/tasks/:id/subtasks
tasksRouter.get(
  "/:id/subtasks",
  validateParams(uuidParamSchema),
  asyncHandler(async (req, res) => {
    const task = await getTaskOrThrow(req.params.id as string);
    await requireMembership(task.workspace_id, req.user!.id);

    const subtasks = await listSubtasks(task.id);
    res.json({ subtasks });
  }),
);

// POST /api/tasks
tasksRouter.post(
  "/",
  validateBody(createTaskSchema),
  asyncHandler(async (req, res) => {
    const body = req.body as CreateTaskInput;

    await requireContributor(body.workspaceId, req.user!.id);
    if (body.assigneeId) {
      await requireAssigneeIsMember(body.workspaceId, body.assigneeId);
    }
    if (body.projectId) {
      await requireProjectInWorkspace(body.workspaceId, body.projectId);
    }
    if (body.parentTaskId) {
      // No cycle check needed here — a brand-new task can't yet be anyone's ancestor.
      await requireValidParent(body.workspaceId, null, body.parentTaskId);
    }

    const task = await createTask({
      workspace_id: body.workspaceId,
      title: body.title,
      description: body.description || null,
      creator_id: req.user!.id,
      assignee_id: body.assigneeId ?? null,
      status: body.status,
      due_at: body.dueAt ?? null,
      project_id: body.projectId ?? null,
      parent_task_id: body.parentTaskId ?? null,
      priority: body.priority,
      start_at: body.startAt ?? null,
      estimate_minutes: body.estimateMinutes ?? null,
      recurrence_rule: body.recurrenceRule ?? null,
      recurrence_interval: body.recurrenceInterval,
      recurrence_until: body.recurrenceUntil ?? null,
    });

    if (body.assigneeId) {
      await taskAssignmentService.setSingleAssignee(task.id, body.assigneeId, req.user!.id);
    }

    await maybeNotifyAssignment(task);
    res.status(201).json({ task });
  }),
);

// PATCH /api/tasks/:id
tasksRouter.patch(
  "/:id",
  validateParams(uuidParamSchema),
  validateBody(updateTaskSchema),
  asyncHandler(async (req, res) => {
    const task = await getTaskOrThrow(req.params.id as string);
    const body = req.body as UpdateTaskInput;

    const { canManage } = await getTaskEditRights(task, req.user!.id);

    // A plain assignee may only move the task along; everything else is
    // reserved for the creator / workspace owner.
    const updates: Partial<Task> = {};

    if (canManage) {
      if (body.title !== undefined) updates.title = body.title;
      if (body.description !== undefined) updates.description = body.description || null;
      if (body.dueAt !== undefined) updates.due_at = body.dueAt;
      if (body.assigneeId !== undefined) {
        if (body.assigneeId) {
          await requireAssigneeIsMember(task.workspace_id, body.assigneeId);
        }
        updates.assignee_id = body.assigneeId;
      }
      if (body.projectId !== undefined) {
        if (body.projectId) {
          await requireProjectInWorkspace(task.workspace_id, body.projectId);
        }
        updates.project_id = body.projectId;
      }
      if (body.parentTaskId !== undefined) {
        if (body.parentTaskId) {
          await requireValidParent(task.workspace_id, task.id, body.parentTaskId);
        }
        updates.parent_task_id = body.parentTaskId;
      }
      if (body.priority !== undefined) updates.priority = body.priority;
      if (body.startAt !== undefined) updates.start_at = body.startAt;
      if (body.estimateMinutes !== undefined) updates.estimate_minutes = body.estimateMinutes;
      if (body.actualMinutes !== undefined) updates.actual_minutes = body.actualMinutes;
      if (body.position !== undefined) updates.position = body.position;
      if (body.archived !== undefined) updates.archived_at = body.archived ? new Date().toISOString() : null;
      if (body.recurrenceRule !== undefined) updates.recurrence_rule = body.recurrenceRule;
      if (body.recurrenceInterval !== undefined) updates.recurrence_interval = body.recurrenceInterval;
      if (body.recurrenceUntil !== undefined) updates.recurrence_until = body.recurrenceUntil;
    }

    if (body.status !== undefined) {
      updates.status = body.status;
      // completed_at tracks entry into 'done' specifically — leaving it is
      // possible (reopening a task), so it's cleared again rather than left
      // stamped with a stale completion time.
      updates.completed_at = body.status === "done" ? new Date().toISOString() : null;
    }

    if (Object.keys(updates).length === 0) {
      throw new ApiError(ERROR_CODES.VALIDATION_FAILED, { message: "Нет данных для обновления" });
    }

    // PATCH is partial, so this checks the EFFECTIVE state (this update's
    // value, or else the task's existing one) — createTaskSchema can
    // refine on this in one shot, but a partial update can't.
    const effectiveDueAt = updates.due_at !== undefined ? updates.due_at : task.due_at;
    const effectiveRecurrenceRule = updates.recurrence_rule !== undefined ? updates.recurrence_rule : task.recurrence_rule;
    if (effectiveRecurrenceRule && !effectiveDueAt) {
      throw new ApiError(ERROR_CODES.VALIDATION_FAILED, { message: "Для повторяющейся задачи нужен срок выполнения" });
    }

    if (updates.status === "done" && task.status !== "done") {
      if (!(await taskDependencyRepository.areDependenciesResolved(task.id))) {
        throw new ApiError(ERROR_CODES.TASK_BLOCKED_BY_DEPENDENCIES);
      }
    }

    const recurrenceRoll = applyRecurrenceOnCompletion(task, updates);
    const result = await updateTaskWithVersionCheck(task.id, body.version, recurrenceRoll.updates);
    if (!result.ok) {
      // Someone else updated (or deleted) this task between our read and
      // this write. Re-fetch so the client learns the actual current
      // version rather than the stale one it already knew was wrong.
      const current = await getActiveTaskById(task.id);
      throw new ApiError(ERROR_CODES.TASK_VERSION_CONFLICT, {
        details: current ? { currentVersion: current.version } : { deleted: true },
      });
    }

    if (recurrenceRoll.rolled) {
      // task_reminders is keyed by task_id, and rolling reuses the same
      // row/id — without this, the first occurrence's reminder would
      // permanently block every occurrence after it.
      await reminderRepository.clearRemindersForTask(task.id);
    }

    const assigneeChanged = updates.assignee_id !== undefined && updates.assignee_id !== task.assignee_id;
    if (assigneeChanged) {
      // The legacy single-assignee field just changed via the general PATCH
      // path — replace the whole task_assignees set to match so a reader
      // using either model sees the same answer (see taskAssignmentService).
      await taskAssignmentService.setSingleAssignee(task.id, updates.assignee_id ?? null, req.user!.id);
      await maybeNotifyAssignment(result.task);
    }

    res.json({ task: result.task });
  }),
);

// GET /api/tasks/:id/assignees
tasksRouter.get(
  "/:id/assignees",
  validateParams(uuidParamSchema),
  asyncHandler(async (req, res) => {
    const task = await getTaskOrThrow(req.params.id as string);
    await requireMembership(task.workspace_id, req.user!.id);

    const assignees = await listAssignees(task.id);
    res.json({ assignees });
  }),
);

// POST /api/tasks/:id/assignees — add one more assignee without disturbing existing ones.
tasksRouter.post(
  "/:id/assignees",
  validateParams(uuidParamSchema),
  validateBody(addAssigneeSchema),
  asyncHandler(async (req, res) => {
    const task = await getTaskOrThrow(req.params.id as string);
    await requireMembership(task.workspace_id, req.user!.id);
    await requireTaskManager(task, req.user!.id);

    const { userId } = req.body as AddAssigneeInput;
    await requireAssigneeIsMember(task.workspace_id, userId);

    await taskAssignmentService.addAssignee(task.id, userId, req.user!.id);

    const assignee = await findUserById(userId);
    if (assignee) {
      try {
        await notifyTaskAssigned({
          assigneeTelegramId: assignee.telegram_id,
          task,
          workspaceName: (await getWorkspaceById(task.workspace_id))?.name ?? "",
        });
      } catch (err) {
        console.error("Failed to send Telegram notification:", err);
      }
    }

    const assignees = await listAssignees(task.id);
    res.status(201).json({ assignees });
  }),
);

// DELETE /api/tasks/:id/assignees/:userId
tasksRouter.delete(
  "/:id/assignees/:userId",
  validateParams(taskAssigneeParamSchema),
  asyncHandler(async (req, res) => {
    const task = await getTaskOrThrow(req.params.id as string);
    await requireMembership(task.workspace_id, req.user!.id);
    await requireTaskManager(task, req.user!.id);

    const { userId } = req.params as { userId: string };
    await taskAssignmentService.removeAssignee(task.id, userId, task.assignee_id);

    res.status(204).send();
  }),
);

// GET /api/tasks/:id/labels
tasksRouter.get(
  "/:id/labels",
  validateParams(uuidParamSchema),
  asyncHandler(async (req, res) => {
    const task = await getTaskOrThrow(req.params.id as string);
    await requireMembership(task.workspace_id, req.user!.id);

    const labels = await listLabelsForTask(task.id);
    res.json({ labels });
  }),
);

// POST /api/tasks/:id/labels
tasksRouter.post(
  "/:id/labels",
  validateParams(uuidParamSchema),
  validateBody(attachLabelSchema),
  asyncHandler(async (req, res) => {
    const task = await getTaskOrThrow(req.params.id as string);
    await requireMembership(task.workspace_id, req.user!.id);
    await requireTaskManager(task, req.user!.id);

    const { labelId } = req.body as AttachLabelInput;
    const label = await getLabelById(labelId);
    if (!label || label.workspace_id !== task.workspace_id) {
      throw new ApiError(ERROR_CODES.LABEL_NOT_FOUND);
    }

    await attachLabel(task.id, labelId);
    const labels = await listLabelsForTask(task.id);
    res.status(201).json({ labels });
  }),
);

// DELETE /api/tasks/:id/labels/:labelId
tasksRouter.delete(
  "/:id/labels/:labelId",
  validateParams(taskLabelParamSchema),
  asyncHandler(async (req, res) => {
    const task = await getTaskOrThrow(req.params.id as string);
    await requireMembership(task.workspace_id, req.user!.id);
    await requireTaskManager(task, req.user!.id);

    const { labelId } = req.params as { labelId: string };
    await detachLabel(task.id, labelId);

    res.status(204).send();
  }),
);

// GET /api/tasks/:id/checklist
tasksRouter.get(
  "/:id/checklist",
  validateParams(uuidParamSchema),
  asyncHandler(async (req, res) => {
    const task = await getTaskOrThrow(req.params.id as string);
    await requireMembership(task.workspace_id, req.user!.id);

    const items = await checklistItemRepository.listForTask(task.id);
    res.json({ items });
  }),
);

// POST /api/tasks/:id/checklist — structural edit (adding an item): manager only.
tasksRouter.post(
  "/:id/checklist",
  validateParams(uuidParamSchema),
  validateBody(createChecklistItemSchema),
  asyncHandler(async (req, res) => {
    const task = await getTaskOrThrow(req.params.id as string);
    await requireMembership(task.workspace_id, req.user!.id);
    await requireTaskManager(task, req.user!.id);

    const { title } = req.body as CreateChecklistItemInput;
    const item = await checklistItemRepository.create(task.id, title);
    res.status(201).json({ item });
  }),
);

// PATCH /api/tasks/:id/checklist/:itemId — isDone alone is open to any
// assignee; renaming/repositioning requires manager rights (see canToggleChecklist).
tasksRouter.patch(
  "/:id/checklist/:itemId",
  validateParams(taskChecklistItemParamSchema),
  validateBody(updateChecklistItemSchema),
  asyncHandler(async (req, res) => {
    const task = await getTaskOrThrow(req.params.id as string);
    await requireMembership(task.workspace_id, req.user!.id);

    const { itemId } = req.params as { itemId: string };
    const existing = await checklistItemRepository.getById(itemId);
    if (!existing || existing.task_id !== task.id) {
      throw new ApiError(ERROR_CODES.CHECKLIST_ITEM_NOT_FOUND);
    }

    const body = req.body as UpdateChecklistItemInput;
    const isStructuralEdit = body.title !== undefined || body.position !== undefined;

    if (isStructuralEdit) {
      await requireTaskManager(task, req.user!.id);
    } else if (!(await canToggleChecklist(task, req.user!.id))) {
      throw new ApiError(ERROR_CODES.TASK_ACCESS_DENIED, {
        message: "Недостаточно прав для изменения задачи",
      });
    }

    const item = await checklistItemRepository.update(itemId, {
      ...(body.title !== undefined ? { title: body.title } : {}),
      ...(body.position !== undefined ? { position: body.position } : {}),
      ...(body.isDone !== undefined ? { is_done: body.isDone } : {}),
    });
    res.json({ item });
  }),
);

// DELETE /api/tasks/:id/checklist/:itemId — structural edit: manager only.
tasksRouter.delete(
  "/:id/checklist/:itemId",
  validateParams(taskChecklistItemParamSchema),
  asyncHandler(async (req, res) => {
    const task = await getTaskOrThrow(req.params.id as string);
    await requireMembership(task.workspace_id, req.user!.id);
    await requireTaskManager(task, req.user!.id);

    const { itemId } = req.params as { itemId: string };
    const existing = await checklistItemRepository.getById(itemId);
    if (!existing || existing.task_id !== task.id) {
      throw new ApiError(ERROR_CODES.CHECKLIST_ITEM_NOT_FOUND);
    }

    await checklistItemRepository.remove(itemId);
    res.status(204).send();
  }),
);

// GET /api/tasks/:id/comments
tasksRouter.get(
  "/:id/comments",
  validateParams(uuidParamSchema),
  asyncHandler(async (req, res) => {
    const task = await getTaskOrThrow(req.params.id as string);
    await requireMembership(task.workspace_id, req.user!.id);

    const comments = await taskCommentRepository.listForTask(task.id);
    res.json({ comments });
  }),
);

// POST /api/tasks/:id/comments — a viewer may read but not post, same as
// creating a task itself.
tasksRouter.post(
  "/:id/comments",
  validateParams(uuidParamSchema),
  validateBody(createCommentSchema),
  asyncHandler(async (req, res) => {
    const task = await getTaskOrThrow(req.params.id as string);
    await requireContributor(task.workspace_id, req.user!.id);

    const body = req.body as CreateCommentInput;
    if (body.parentCommentId) {
      const parent = await taskCommentRepository.getById(body.parentCommentId);
      if (!parent || parent.task_id !== task.id) {
        throw new ApiError(ERROR_CODES.COMMENT_NOT_FOUND, { message: "Комментарий, на который вы отвечаете, не найден" });
      }
    }

    const comment = await taskCommentRepository.create(task.id, req.user!.id, body.body, body.parentCommentId ?? null);
    res.status(201).json({ comment });
  }),
);

// PATCH /api/tasks/:id/comments/:commentId — only the author may edit their own comment.
tasksRouter.patch(
  "/:id/comments/:commentId",
  validateParams(taskCommentParamSchema),
  validateBody(updateCommentSchema),
  asyncHandler(async (req, res) => {
    const task = await getTaskOrThrow(req.params.id as string);
    await requireMembership(task.workspace_id, req.user!.id);

    const { commentId } = req.params as { commentId: string };
    const existing = await taskCommentRepository.getById(commentId);
    if (!existing || existing.task_id !== task.id) {
      throw new ApiError(ERROR_CODES.COMMENT_NOT_FOUND);
    }
    if (existing.author_id !== req.user!.id) {
      throw new ApiError(ERROR_CODES.COMMENT_ACCESS_DENIED);
    }

    const { body } = req.body as UpdateCommentInput;
    const comment = await taskCommentRepository.updateBody(commentId, body);
    res.json({ comment });
  }),
);

// DELETE /api/tasks/:id/comments/:commentId — the author, or a task manager
// moderating their workspace, may remove a comment.
tasksRouter.delete(
  "/:id/comments/:commentId",
  validateParams(taskCommentParamSchema),
  asyncHandler(async (req, res) => {
    const task = await getTaskOrThrow(req.params.id as string);
    await requireMembership(task.workspace_id, req.user!.id);

    const { commentId } = req.params as { commentId: string };
    const existing = await taskCommentRepository.getById(commentId);
    if (!existing || existing.task_id !== task.id) {
      throw new ApiError(ERROR_CODES.COMMENT_NOT_FOUND);
    }

    if (existing.author_id !== req.user!.id) {
      await requireTaskManager(task, req.user!.id);
    }

    await taskCommentRepository.softDelete(commentId);
    res.status(204).send();
  }),
);

// DELETE /api/tasks/:id — soft delete. Restorable until the (future) trash
// purge job removes it; see docs/ARCHITECTURE_AUDIT.md section 6.
tasksRouter.delete(
  "/:id",
  validateParams(uuidParamSchema),
  asyncHandler(async (req, res) => {
    const task = await getTaskOrThrow(req.params.id as string);
    await requireMembership(task.workspace_id, req.user!.id);
    await requireTaskManager(task, req.user!.id);

    await softDeleteTask(task.id);

    res.status(204).send();
  }),
);

// GET /api/tasks/:id/dependencies
tasksRouter.get(
  "/:id/dependencies",
  validateParams(uuidParamSchema),
  asyncHandler(async (req, res) => {
    const task = await getTaskOrThrow(req.params.id as string);
    await requireMembership(task.workspace_id, req.user!.id);

    const [dependsOn, blocks] = await Promise.all([
      taskDependencyRepository.listDependencies(task.id),
      taskDependencyRepository.listDependents(task.id),
    ]);
    res.json({ dependsOn, blocks });
  }),
);

// POST /api/tasks/:id/dependencies — structural edit: manager only, same tier as labels/checklist.
tasksRouter.post(
  "/:id/dependencies",
  validateParams(uuidParamSchema),
  validateBody(addDependencySchema),
  asyncHandler(async (req, res) => {
    const task = await getTaskOrThrow(req.params.id as string);
    await requireMembership(task.workspace_id, req.user!.id);
    await requireTaskManager(task, req.user!.id);

    const { dependsOnTaskId } = req.body as AddDependencyInput;
    if (dependsOnTaskId === task.id) {
      throw new ApiError(ERROR_CODES.DEPENDENCY_CYCLE);
    }

    const dependsOnTask = await getTaskOrThrow(dependsOnTaskId);
    if (dependsOnTask.workspace_id !== task.workspace_id) {
      throw new ApiError(ERROR_CODES.DEPENDENCY_CROSS_WORKSPACE);
    }
    if (await taskDependencyRepository.wouldCreateCycle(task.id, dependsOnTaskId)) {
      throw new ApiError(ERROR_CODES.DEPENDENCY_CYCLE);
    }

    await taskDependencyRepository.addDependency(task.id, dependsOnTaskId);
    const dependsOn = await taskDependencyRepository.listDependencies(task.id);
    res.status(201).json({ dependsOn });
  }),
);

// DELETE /api/tasks/:id/dependencies/:dependsOnTaskId
tasksRouter.delete(
  "/:id/dependencies/:dependsOnTaskId",
  validateParams(taskDependencyParamSchema),
  asyncHandler(async (req, res) => {
    const task = await getTaskOrThrow(req.params.id as string);
    await requireMembership(task.workspace_id, req.user!.id);
    await requireTaskManager(task, req.user!.id);

    const { dependsOnTaskId } = req.params as { dependsOnTaskId: string };
    await taskDependencyRepository.removeDependency(task.id, dependsOnTaskId);

    res.status(204).send();
  }),
);

// GET /api/workspaces/:workspaceId/tasks — mounted separately in index.ts
export const workspaceTasksRouter = Router({ mergeParams: true });
workspaceTasksRouter.use(requireAuth);

workspaceTasksRouter.get(
  "/",
  validateParams(workspaceIdParamSchema),
  validateQuery(taskListQuerySchema),
  asyncHandler(async (req, res) => {
    const { workspaceId } = req.params as { workspaceId: string };
    await requireMembership(workspaceId, req.user!.id);

    const { q, projectId, status, priority, assigneeId, authorId, labelId, dueBefore, dueAfter } =
      req.query as unknown as TaskListQuery;
    const tasks = await listTasksForWorkspace(workspaceId, {
      search: q,
      projectId,
      status,
      priority,
      assigneeId,
      authorId,
      labelId,
      dueBefore,
      dueAfter,
    });
    res.json({ tasks });
  }),
);

async function maybeNotifyAssignment(task: Task): Promise<void> {
  if (!task.assignee_id) return;

  const [assignee, workspace] = await Promise.all([
    findUserById(task.assignee_id),
    getWorkspaceById(task.workspace_id),
  ]);

  const telegramId = assignee?.telegram_id;
  const workspaceName = workspace?.name;
  if (!telegramId || !workspaceName) return;

  try {
    await notifyTaskAssigned({ assigneeTelegramId: telegramId, task, workspaceName });
  } catch (err) {
    // Notification failure should never break the request.
    console.error("Failed to send Telegram notification:", err);
  }
}
