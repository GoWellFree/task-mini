import { Router } from "express";
import {
  ERROR_CODES,
  addAssigneeSchema,
  createTaskSchema,
  taskAssigneeParamSchema,
  updateTaskSchema,
  uuidParamSchema,
  workspaceIdParamSchema,
  type AddAssigneeInput,
  type CreateTaskInput,
  type UpdateTaskInput,
} from "@task-mini/shared";
import { ApiError } from "../lib/apiError.js";
import { requireAuth } from "../middleware/auth.js";
import { asyncHandler, validateBody, validateParams } from "../middleware/validate.js";
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
import { getProjectById } from "../repositories/projectRepository.js";
import { findUserById } from "../repositories/userRepository.js";
import { getWorkspaceById } from "../repositories/workspaceRepository.js";
import * as taskAssignmentService from "../services/taskAssignmentService.js";
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

    const result = await updateTaskWithVersionCheck(task.id, body.version, updates);
    if (!result.ok) {
      // Someone else updated (or deleted) this task between our read and
      // this write. Re-fetch so the client learns the actual current
      // version rather than the stale one it already knew was wrong.
      const current = await getActiveTaskById(task.id);
      throw new ApiError(ERROR_CODES.TASK_VERSION_CONFLICT, {
        details: current ? { currentVersion: current.version } : { deleted: true },
      });
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

// GET /api/workspaces/:workspaceId/tasks — mounted separately in index.ts
export const workspaceTasksRouter = Router({ mergeParams: true });
workspaceTasksRouter.use(requireAuth);

workspaceTasksRouter.get(
  "/",
  validateParams(workspaceIdParamSchema),
  asyncHandler(async (req, res) => {
    const { workspaceId } = req.params as { workspaceId: string };
    await requireMembership(workspaceId, req.user!.id);

    const tasks = await listTasksForWorkspace(workspaceId);
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
