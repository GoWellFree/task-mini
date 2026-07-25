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
import { supabase } from "../lib/supabase.js";
import { ApiError } from "../lib/apiError.js";
import { requireAuth } from "../middleware/auth.js";
import { asyncHandler, validateBody, validateParams } from "../middleware/validate.js";
import {
  getTaskEditRights,
  requireAssigneeIsMember,
  requireMembership,
  requireTaskManager,
} from "../permissions/workspacePermissions.js";
import { notifyTaskAssigned } from "../lib/bot.js";
import type { Task, User, Workspace } from "../types/index.js";

export const tasksRouter = Router();
tasksRouter.use(requireAuth);

async function getTaskOrThrow(taskId: string): Promise<Task> {
  const { data } = await supabase.from("tasks").select("*").eq("id", taskId).maybeSingle();
  if (!data) {
    throw new ApiError(ERROR_CODES.TASK_NOT_FOUND);
  }
  return data as Task;
}

// GET /api/tasks/my — tasks assigned to the current user, across all workspaces
tasksRouter.get(
  "/my",
  asyncHandler(async (req, res) => {
    const { data, error } = await supabase
      .from("tasks")
      .select("*, workspace:workspaces(name)")
      .eq("assignee_id", req.user!.id)
      .order("due_at", { ascending: true, nullsFirst: false });

    if (error) throw error;

    res.json({ tasks: data ?? [] });
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

    await requireMembership(body.workspaceId, req.user!.id);
    if (body.assigneeId) {
      await requireAssigneeIsMember(body.workspaceId, body.assigneeId);
    }

    const { data: task, error } = await supabase
      .from("tasks")
      .insert({
        workspace_id: body.workspaceId,
        title: body.title,
        description: body.description || null,
        creator_id: req.user!.id,
        assignee_id: body.assigneeId ?? null,
        status: body.status ?? "todo",
        due_at: body.dueAt ?? null,
      })
      .select("*")
      .single();

    if (error || !task) throw error ?? new ApiError(ERROR_CODES.INTERNAL);

    await maybeNotifyAssignment(task as Task);
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

    updates.updated_at = new Date().toISOString();

    const { data: updated, error } = await supabase
      .from("tasks")
      .update(updates)
      .eq("id", task.id)
      .select("*")
      .single();

    if (error || !updated) throw error ?? new ApiError(ERROR_CODES.INTERNAL);

    const assigneeChanged = updates.assignee_id !== undefined && updates.assignee_id !== task.assignee_id;
    if (assigneeChanged) {
      await maybeNotifyAssignment(updated as Task);
    }

    res.json({ task: updated });
  }),
);

// DELETE /api/tasks/:id
tasksRouter.delete(
  "/:id",
  validateParams(uuidParamSchema),
  asyncHandler(async (req, res) => {
    const task = await getTaskOrThrow(req.params.id as string);
    await requireMembership(task.workspace_id, req.user!.id);
    await requireTaskManager(task, req.user!.id);

    const { error } = await supabase.from("tasks").delete().eq("id", task.id);
    if (error) throw error;

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

    const { data, error } = await supabase
      .from("tasks")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false });

    if (error) throw error;

    res.json({ tasks: data ?? [] });
  }),
);

async function maybeNotifyAssignment(task: Task): Promise<void> {
  if (!task.assignee_id) return;

  const [{ data: assignee }, { data: workspace }] = await Promise.all([
    supabase.from("users").select("telegram_id").eq("id", task.assignee_id).single(),
    supabase.from("workspaces").select("name").eq("id", task.workspace_id).single(),
  ]);

  const telegramId = (assignee as Pick<User, "telegram_id"> | null)?.telegram_id;
  const workspaceName = (workspace as Pick<Workspace, "name"> | null)?.name;
  if (!telegramId || !workspaceName) return;

  try {
    await notifyTaskAssigned({ assigneeTelegramId: telegramId, task, workspaceName });
  } catch (err) {
    // Notification failure should never break the request.
    console.error("Failed to send Telegram notification:", err);
  }
}
