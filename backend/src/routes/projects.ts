import { Router } from "express";
import {
  ERROR_CODES,
  createProjectSchema,
  updateProjectSchema,
  uuidParamSchema,
  workspaceIdParamSchema,
  type CreateProjectInput,
  type UpdateProjectInput,
} from "@task-mini/shared";
import { ApiError } from "../lib/apiError.js";
import { requireAuth } from "../middleware/auth.js";
import { asyncHandler, validateBody, validateParams } from "../middleware/validate.js";
import { requireContributor, requireMembership, requireProjectManager } from "../permissions/workspacePermissions.js";
import { createProject, getProjectById, listProjectsForWorkspace, updateProject } from "../repositories/projectRepository.js";
import type { Project } from "../types/index.js";

async function getProjectOrThrow(id: string): Promise<Project> {
  const project = await getProjectById(id);
  if (!project) {
    throw new ApiError(ERROR_CODES.PROJECT_NOT_FOUND);
  }
  return project;
}

// Mounted at /api/v1/workspaces/:workspaceId/projects
export const workspaceProjectsRouter = Router({ mergeParams: true });
workspaceProjectsRouter.use(requireAuth);

workspaceProjectsRouter.get(
  "/",
  validateParams(workspaceIdParamSchema),
  asyncHandler(async (req, res) => {
    const { workspaceId } = req.params as { workspaceId: string };
    await requireMembership(workspaceId, req.user!.id);

    const projects = await listProjectsForWorkspace(workspaceId);
    res.json({ projects });
  }),
);

workspaceProjectsRouter.post(
  "/",
  validateParams(workspaceIdParamSchema),
  validateBody(createProjectSchema),
  asyncHandler(async (req, res) => {
    const { workspaceId } = req.params as { workspaceId: string };
    await requireContributor(workspaceId, req.user!.id);

    const body = req.body as CreateProjectInput;
    const project = await createProject({
      workspace_id: workspaceId,
      name: body.name,
      description: body.description ?? null,
      icon: body.icon ?? null,
      color: body.color ?? null,
      status: body.status,
      owner_id: req.user!.id,
      start_at: body.startAt ?? null,
      due_at: body.dueAt ?? null,
    });

    res.status(201).json({ project });
  }),
);

// Mounted at /api/v1/projects
export const projectsRouter = Router();
projectsRouter.use(requireAuth);

projectsRouter.get(
  "/:id",
  validateParams(uuidParamSchema),
  asyncHandler(async (req, res) => {
    const project = await getProjectOrThrow(req.params.id as string);
    await requireMembership(project.workspace_id, req.user!.id);
    res.json({ project });
  }),
);

projectsRouter.patch(
  "/:id",
  validateParams(uuidParamSchema),
  validateBody(updateProjectSchema),
  asyncHandler(async (req, res) => {
    const project = await getProjectOrThrow(req.params.id as string);
    await requireMembership(project.workspace_id, req.user!.id);
    await requireProjectManager(project, req.user!.id);

    const body = req.body as UpdateProjectInput;
    const updates: Partial<Project> = {};
    if (body.name !== undefined) updates.name = body.name;
    if (body.description !== undefined) updates.description = body.description;
    if (body.icon !== undefined) updates.icon = body.icon;
    if (body.color !== undefined) updates.color = body.color;
    if (body.startAt !== undefined) updates.start_at = body.startAt;
    if (body.dueAt !== undefined) updates.due_at = body.dueAt;
    if (body.position !== undefined) updates.position = body.position;
    if (body.status !== undefined) {
      updates.status = body.status;
      // archived_at tracks entry into the 'archived' status specifically —
      // leaving is possible (reactivating a project), so it's cleared again
      // rather than left stamped with a stale archive time.
      updates.archived_at = body.status === "archived" ? new Date().toISOString() : null;
    }

    const updated = await updateProject(project.id, updates);
    res.json({ project: updated });
  }),
);
