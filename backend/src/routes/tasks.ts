import { Router } from "express";
import { supabase } from "../lib/supabase.js";
import { requireAuth } from "../middleware/auth.js";
import { notifyTaskAssigned } from "../lib/bot.js";
import type { Task, TaskStatus, User, Workspace, WorkspaceMember } from "../types/index.js";

export const tasksRouter = Router();
tasksRouter.use(requireAuth);

const VALID_STATUSES: TaskStatus[] = ["todo", "in_progress", "done"];

async function getMembership(workspaceId: string, userId: string): Promise<WorkspaceMember | null> {
  const { data } = await supabase
    .from("workspace_members")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .maybeSingle();
  return (data as WorkspaceMember) ?? null;
}

async function getTaskOr404(taskId: string): Promise<Task | null> {
  const { data } = await supabase.from("tasks").select("*").eq("id", taskId).maybeSingle();
  return (data as Task) ?? null;
}

// Can view: any workspace member. Can edit/delete: task creator or workspace owner.
// Assignee may only change status / mark done (checked separately in PATCH).
async function canManageTask(task: Task, userId: string): Promise<boolean> {
  if (task.creator_id === userId) return true;
  const { data: workspace } = await supabase
    .from("workspaces")
    .select("owner_id")
    .eq("id", task.workspace_id)
    .single();
  return (workspace as Pick<Workspace, "owner_id"> | null)?.owner_id === userId;
}

// GET /api/tasks/my — tasks assigned to the current user, across all workspaces
tasksRouter.get("/my", async (req, res) => {
  const { data, error } = await supabase
    .from("tasks")
    .select("*, workspace:workspaces(name)")
    .eq("assignee_id", req.user!.id)
    .order("due_at", { ascending: true, nullsFirst: false });

  if (error) {
    res.status(500).json({ error: "Не удалось загрузить задачи" });
    return;
  }

  res.json({ tasks: data ?? [] });
});

// GET /api/tasks/:id
tasksRouter.get("/:id", async (req, res) => {
  const task = await getTaskOr404(req.params.id);
  if (!task) {
    res.status(404).json({ error: "Задача не найдена" });
    return;
  }

  if (!(await getMembership(task.workspace_id, req.user!.id))) {
    res.status(403).json({ error: "Нет доступа к этой задаче" });
    return;
  }

  res.json({ task });
});

// POST /api/tasks
tasksRouter.post("/", async (req, res) => {
  const { workspaceId, title, description, assigneeId, status, dueAt } = req.body as {
    workspaceId?: string;
    title?: string;
    description?: string;
    assigneeId?: string;
    status?: TaskStatus;
    dueAt?: string;
  };

  if (!workspaceId || !title || !title.trim()) {
    res.status(400).json({ error: "Укажите группу и название задачи" });
    return;
  }

  if (!(await getMembership(workspaceId, req.user!.id))) {
    res.status(403).json({ error: "Вы не состоите в этой группе" });
    return;
  }

  if (assigneeId && !(await getMembership(workspaceId, assigneeId))) {
    res.status(400).json({ error: "Исполнитель должен быть участником группы" });
    return;
  }

  if (status && !VALID_STATUSES.includes(status)) {
    res.status(400).json({ error: "Недопустимый статус" });
    return;
  }

  const { data: task, error } = await supabase
    .from("tasks")
    .insert({
      workspace_id: workspaceId,
      title: title.trim(),
      description: description?.trim() || null,
      creator_id: req.user!.id,
      assignee_id: assigneeId ?? null,
      status: status ?? "todo",
      due_at: dueAt ?? null,
    })
    .select("*")
    .single();

  if (error || !task) {
    res.status(500).json({ error: "Не удалось создать задачу" });
    return;
  }

  await maybeNotifyAssignment(task as Task);
  res.status(201).json({ task });
});

// GET /api/workspaces/:workspaceId/tasks — mounted separately in index.ts
export const workspaceTasksRouter = Router({ mergeParams: true });
workspaceTasksRouter.use(requireAuth);

workspaceTasksRouter.get("/", async (req, res) => {
  const { workspaceId } = req.params as { workspaceId: string };

  if (!(await getMembership(workspaceId, req.user!.id))) {
    res.status(403).json({ error: "Вы не состоите в этой группе" });
    return;
  }

  const { data, error } = await supabase
    .from("tasks")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false });

  if (error) {
    res.status(500).json({ error: "Не удалось загрузить задачи группы" });
    return;
  }

  res.json({ tasks: data ?? [] });
});

// PATCH /api/tasks/:id
tasksRouter.patch("/:id", async (req, res) => {
  const task = await getTaskOr404(req.params.id);
  if (!task) {
    res.status(404).json({ error: "Задача не найдена" });
    return;
  }

  const membership = await getMembership(task.workspace_id, req.user!.id);
  if (!membership) {
    res.status(403).json({ error: "Нет доступа к этой задаче" });
    return;
  }

  const isManager = await canManageTask(task, req.user!.id);
  const isAssignee = task.assignee_id === req.user!.id;

  if (!isManager && !isAssignee) {
    res.status(403).json({ error: "Недостаточно прав для изменения задачи" });
    return;
  }

  const body = req.body as {
    title?: string;
    description?: string;
    assigneeId?: string | null;
    status?: TaskStatus;
    dueAt?: string | null;
  };

  // The assignee (who isn't creator/owner) may only change status.
  const updates: Partial<Task> = {};
  if (isManager) {
    if (body.title !== undefined) updates.title = body.title.trim();
    if (body.description !== undefined) updates.description = body.description?.trim() || null;
    if (body.dueAt !== undefined) updates.due_at = body.dueAt;
    if (body.assigneeId !== undefined) {
      if (body.assigneeId && !(await getMembership(task.workspace_id, body.assigneeId))) {
        res.status(400).json({ error: "Исполнитель должен быть участником группы" });
        return;
      }
      updates.assignee_id = body.assigneeId;
    }
  }

  if (body.status !== undefined) {
    if (!VALID_STATUSES.includes(body.status)) {
      res.status(400).json({ error: "Недопустимый статус" });
      return;
    }
    updates.status = body.status;
  }

  if (Object.keys(updates).length === 0) {
    res.status(400).json({ error: "Нет данных для обновления" });
    return;
  }

  updates.updated_at = new Date().toISOString();

  const { data: updated, error } = await supabase
    .from("tasks")
    .update(updates)
    .eq("id", task.id)
    .select("*")
    .single();

  if (error || !updated) {
    res.status(500).json({ error: "Не удалось обновить задачу" });
    return;
  }

  const assigneeChanged = updates.assignee_id !== undefined && updates.assignee_id !== task.assignee_id;
  if (assigneeChanged) {
    await maybeNotifyAssignment(updated as Task);
  }

  res.json({ task: updated });
});

// DELETE /api/tasks/:id
tasksRouter.delete("/:id", async (req, res) => {
  const task = await getTaskOr404(req.params.id);
  if (!task) {
    res.status(404).json({ error: "Задача не найдена" });
    return;
  }

  if (!(await canManageTask(task, req.user!.id))) {
    res.status(403).json({ error: "Недостаточно прав для удаления задачи" });
    return;
  }

  const { error } = await supabase.from("tasks").delete().eq("id", task.id);
  if (error) {
    res.status(500).json({ error: "Не удалось удалить задачу" });
    return;
  }

  res.status(204).send();
});

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
