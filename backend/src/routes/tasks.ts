import { Router } from "express";
import {
  ERROR_CODES,
  createTaskSchema,
  updateTaskSchema,
  uuidParamSchema,
  workspaceIdParamSchema,
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
  listTasksAssignedToUser,
  listTasksForWorkspace,
  softDeleteTask,
  updateTaskWithVersionCheck,
} from "../repositories/taskRepository.js";
import { findUserById } from "../repositories/userRepository.js";
import { getWorkspaceById } from "../repositories/workspaceRepository.js";
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

    const task = await createTask({
      workspace_id: body.workspaceId,
      title: body.title,
      description: body.description || null,
      creator_id: req.user!.id,
      assignee_id: body.assigneeId ?? null,
      status: body.status,
      due_at: body.dueAt ?? null,
    });

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
    }

    if (body.status !== undefined) updates.status = body.status;

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
      await maybeNotifyAssignment(result.task);
    }

    res.json({ task: result.task });
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
