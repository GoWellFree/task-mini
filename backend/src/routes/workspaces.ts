import { randomBytes } from "node:crypto";
import { Router } from "express";
import { supabase } from "../lib/supabase.js";
import { requireAuth } from "../middleware/auth.js";
import type { Workspace, WorkspaceMemberWithUser } from "../types/index.js";

export const workspacesRouter = Router();
workspacesRouter.use(requireAuth);

function generateInviteCode(): string {
  return randomBytes(6).toString("hex");
}

async function isMember(workspaceId: string, userId: string): Promise<boolean> {
  const { data } = await supabase
    .from("workspace_members")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .maybeSingle();
  return Boolean(data);
}

// GET /api/workspaces — workspaces the current user belongs to
workspacesRouter.get("/", async (req, res) => {
  const { data, error } = await supabase
    .from("workspace_members")
    .select("workspace:workspaces(*)")
    .eq("user_id", req.user!.id);

  if (error) {
    res.status(500).json({ error: "Не удалось загрузить рабочие группы" });
    return;
  }

  const workspaces = (data ?? []).map((row) => row.workspace).filter(Boolean) as unknown as Workspace[];
  res.json({ workspaces });
});

// POST /api/workspaces — create a workspace, creator becomes owner
workspacesRouter.post("/", async (req, res) => {
  const { name } = req.body as { name?: string };
  if (!name || !name.trim()) {
    res.status(400).json({ error: "Укажите название группы" });
    return;
  }

  const { data: workspace, error } = await supabase
    .from("workspaces")
    .insert({ name: name.trim(), owner_id: req.user!.id, invite_code: generateInviteCode() })
    .select("*")
    .single();

  if (error || !workspace) {
    res.status(500).json({ error: "Не удалось создать группу" });
    return;
  }

  const { error: memberError } = await supabase
    .from("workspace_members")
    .insert({ workspace_id: workspace.id, user_id: req.user!.id, role: "owner" });

  if (memberError) {
    res.status(500).json({ error: "Не удалось добавить владельца в группу" });
    return;
  }

  res.status(201).json({ workspace: workspace as Workspace });
});

// GET /api/workspaces/:id
workspacesRouter.get("/:id", async (req, res) => {
  const { id } = req.params;

  if (!(await isMember(id, req.user!.id))) {
    res.status(403).json({ error: "Вы не состоите в этой группе" });
    return;
  }

  const { data, error } = await supabase.from("workspaces").select("*").eq("id", id).single();

  if (error || !data) {
    res.status(404).json({ error: "Группа не найдена" });
    return;
  }

  res.json({ workspace: data as Workspace });
});

// GET /api/workspaces/:id/members
workspacesRouter.get("/:id/members", async (req, res) => {
  const { id } = req.params;

  if (!(await isMember(id, req.user!.id))) {
    res.status(403).json({ error: "Вы не состоите в этой группе" });
    return;
  }

  const { data, error } = await supabase
    .from("workspace_members")
    .select("*, user:users(id, username, first_name, last_name, telegram_id)")
    .eq("workspace_id", id);

  if (error) {
    res.status(500).json({ error: "Не удалось загрузить участников" });
    return;
  }

  res.json({ members: (data ?? []) as unknown as WorkspaceMemberWithUser[] });
});

// POST /api/workspaces/join/:inviteCode
workspacesRouter.post("/join/:inviteCode", async (req, res) => {
  const { inviteCode } = req.params;

  const { data: workspace, error } = await supabase
    .from("workspaces")
    .select("*")
    .eq("invite_code", inviteCode)
    .maybeSingle();

  if (error || !workspace) {
    res.status(404).json({ error: "Приглашение не найдено" });
    return;
  }

  if (await isMember(workspace.id, req.user!.id)) {
    res.json({ workspace: workspace as Workspace });
    return;
  }

  const { error: joinError } = await supabase
    .from("workspace_members")
    .insert({ workspace_id: workspace.id, user_id: req.user!.id, role: "member" });

  if (joinError) {
    res.status(500).json({ error: "Не удалось присоединиться к группе" });
    return;
  }

  res.status(201).json({ workspace: workspace as Workspace });
});
