import { Router } from "express";
import { ERROR_CODES, createWorkspaceSchema, uuidParamSchema, type CreateWorkspaceInput } from "@task-mini/shared";
import { ApiError } from "../lib/apiError.js";
import { requireAuth } from "../middleware/auth.js";
import { asyncHandler, validateBody, validateParams } from "../middleware/validate.js";
import { getMembership, requireMembership } from "../permissions/workspacePermissions.js";
import * as workspaceRepository from "../repositories/workspaceRepository.js";
import { createWorkspaceWithOwner } from "../services/workspaceService.js";

export const workspacesRouter = Router();
workspacesRouter.use(requireAuth);

// GET /api/workspaces — workspaces the current user belongs to
workspacesRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const workspaces = await workspaceRepository.listWorkspacesForUser(req.user!.id);
    res.json({ workspaces });
  }),
);

// POST /api/workspaces — create a workspace, creator becomes owner
workspacesRouter.post(
  "/",
  validateBody(createWorkspaceSchema),
  asyncHandler(async (req, res) => {
    const { name } = req.body as CreateWorkspaceInput;
    const workspace = await createWorkspaceWithOwner(name, req.user!.id);
    res.status(201).json({ workspace });
  }),
);

// GET /api/workspaces/:id
workspacesRouter.get(
  "/:id",
  validateParams(uuidParamSchema),
  asyncHandler(async (req, res) => {
    const id = req.params.id as string;
    await requireMembership(id, req.user!.id);

    const workspace = await workspaceRepository.getWorkspaceById(id);
    if (!workspace) {
      throw new ApiError(ERROR_CODES.WORKSPACE_NOT_FOUND);
    }

    res.json({ workspace });
  }),
);

// GET /api/workspaces/:id/members
workspacesRouter.get(
  "/:id/members",
  validateParams(uuidParamSchema),
  asyncHandler(async (req, res) => {
    const id = req.params.id as string;
    await requireMembership(id, req.user!.id);

    const members = await workspaceRepository.getWorkspaceMembers(id);
    res.json({ members });
  }),
);

// POST /api/workspaces/join/:inviteCode
workspacesRouter.post(
  "/join/:inviteCode",
  asyncHandler(async (req, res) => {
    const { inviteCode } = req.params as { inviteCode: string };

    const workspace = await workspaceRepository.findWorkspaceByInviteCode(inviteCode);
    // A personal workspace's invite_code exists only because the column is
    // required — it was never meant to be shareable. Treated as not-found
    // rather than a distinct "can't join a personal workspace" error, so a
    // guessed/leaked code doesn't confirm one exists behind it either.
    if (!workspace || workspace.type === "personal") {
      throw new ApiError(ERROR_CODES.INVITE_NOT_FOUND);
    }

    if (await getMembership(workspace.id, req.user!.id)) {
      res.json({ workspace });
      return;
    }

    await workspaceRepository.addMember(workspace.id, req.user!.id, "member");
    res.status(201).json({ workspace });
  }),
);
