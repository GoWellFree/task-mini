import { randomBytes } from "node:crypto";
import { Router } from "express";
import { ERROR_CODES, createWorkspaceSchema, uuidParamSchema, type CreateWorkspaceInput } from "@task-mini/shared";
import { supabase } from "../lib/supabase.js";
import { ApiError } from "../lib/apiError.js";
import { requireAuth } from "../middleware/auth.js";
import { asyncHandler, validateBody, validateParams } from "../middleware/validate.js";
import { requireMembership } from "../permissions/workspacePermissions.js";
import type { Workspace, WorkspaceMemberWithUser } from "../types/index.js";

export const workspacesRouter = Router();
workspacesRouter.use(requireAuth);

function generateInviteCode(): string {
  return randomBytes(6).toString("hex");
}

// GET /api/workspaces — workspaces the current user belongs to
workspacesRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const { data, error } = await supabase
      .from("workspace_members")
      .select("workspace:workspaces(*)")
      .eq("user_id", req.user!.id);

    if (error) throw error;

    const workspaces = (data ?? []).map((row) => row.workspace).filter(Boolean) as unknown as Workspace[];
    res.json({ workspaces });
  }),
);

// POST /api/workspaces — create a workspace, creator becomes owner
workspacesRouter.post(
  "/",
  validateBody(createWorkspaceSchema),
  asyncHandler(async (req, res) => {
    const { name } = req.body as CreateWorkspaceInput;

    const { data: workspace, error } = await supabase
      .from("workspaces")
      .insert({ name, owner_id: req.user!.id, invite_code: generateInviteCode() })
      .select("*")
      .single();

    if (error || !workspace) throw error ?? new ApiError(ERROR_CODES.INTERNAL);

    const { error: memberError } = await supabase
      .from("workspace_members")
      .insert({ workspace_id: workspace.id, user_id: req.user!.id, role: "owner" });

    if (memberError) throw memberError;

    res.status(201).json({ workspace: workspace as Workspace });
  }),
);

// GET /api/workspaces/:id
workspacesRouter.get(
  "/:id",
  validateParams(uuidParamSchema),
  asyncHandler(async (req, res) => {
    const id = req.params.id as string;
    await requireMembership(id, req.user!.id);

    const { data } = await supabase.from("workspaces").select("*").eq("id", id).maybeSingle();
    if (!data) {
      throw new ApiError(ERROR_CODES.WORKSPACE_NOT_FOUND);
    }

    res.json({ workspace: data as Workspace });
  }),
);

// GET /api/workspaces/:id/members
workspacesRouter.get(
  "/:id/members",
  validateParams(uuidParamSchema),
  asyncHandler(async (req, res) => {
    const id = req.params.id as string;
    await requireMembership(id, req.user!.id);

    const { data, error } = await supabase
      .from("workspace_members")
      .select("*, user:users(id, username, first_name, last_name, telegram_id)")
      .eq("workspace_id", id);

    if (error) throw error;

    res.json({ members: (data ?? []) as unknown as WorkspaceMemberWithUser[] });
  }),
);

// POST /api/workspaces/join/:inviteCode
workspacesRouter.post(
  "/join/:inviteCode",
  asyncHandler(async (req, res) => {
    const { inviteCode } = req.params as { inviteCode: string };

    const { data: workspace } = await supabase
      .from("workspaces")
      .select("*")
      .eq("invite_code", inviteCode)
      .maybeSingle();

    if (!workspace) {
      throw new ApiError(ERROR_CODES.INVITE_NOT_FOUND);
    }

    const { data: existing } = await supabase
      .from("workspace_members")
      .select("id")
      .eq("workspace_id", workspace.id)
      .eq("user_id", req.user!.id)
      .maybeSingle();

    if (existing) {
      res.json({ workspace: workspace as Workspace });
      return;
    }

    const { error: joinError } = await supabase
      .from("workspace_members")
      .insert({ workspace_id: workspace.id, user_id: req.user!.id, role: "member" });

    if (joinError) throw joinError;

    res.status(201).json({ workspace: workspace as Workspace });
  }),
);
