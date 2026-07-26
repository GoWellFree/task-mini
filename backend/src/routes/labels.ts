import { Router } from "express";
import {
  ERROR_CODES,
  createLabelSchema,
  updateLabelSchema,
  uuidParamSchema,
  workspaceIdParamSchema,
  type CreateLabelInput,
  type UpdateLabelInput,
} from "@task-mini/shared";
import { ApiError } from "../lib/apiError.js";
import { requireAuth } from "../middleware/auth.js";
import { asyncHandler, validateBody, validateParams } from "../middleware/validate.js";
import { requireContributor, requireMembership, requireWorkspaceManager } from "../permissions/workspacePermissions.js";
import {
  createLabel,
  deleteLabel,
  getLabelById,
  listLabelsForWorkspace,
  updateLabel,
} from "../repositories/labelRepository.js";

async function getLabelOrThrow(id: string) {
  const label = await getLabelById(id);
  if (!label) throw new ApiError(ERROR_CODES.LABEL_NOT_FOUND);
  return label;
}

// Mounted at /api/v1/workspaces/:workspaceId/labels
export const workspaceLabelsRouter = Router({ mergeParams: true });
workspaceLabelsRouter.use(requireAuth);

workspaceLabelsRouter.get(
  "/",
  validateParams(workspaceIdParamSchema),
  asyncHandler(async (req, res) => {
    const { workspaceId } = req.params as { workspaceId: string };
    await requireMembership(workspaceId, req.user!.id);

    const labels = await listLabelsForWorkspace(workspaceId);
    res.json({ labels });
  }),
);

workspaceLabelsRouter.post(
  "/",
  validateParams(workspaceIdParamSchema),
  validateBody(createLabelSchema),
  asyncHandler(async (req, res) => {
    const { workspaceId } = req.params as { workspaceId: string };
    // Any contributing member may introduce a new label — it's additive and
    // low-stakes, unlike renaming/deleting one that's already in use.
    await requireContributor(workspaceId, req.user!.id);

    const body = req.body as CreateLabelInput;
    const label = await createLabel(workspaceId, body.name, body.color ?? null);
    res.status(201).json({ label });
  }),
);

// Mounted at /api/v1/labels
export const labelsRouter = Router();
labelsRouter.use(requireAuth);

labelsRouter.patch(
  "/:id",
  validateParams(uuidParamSchema),
  validateBody(updateLabelSchema),
  asyncHandler(async (req, res) => {
    const label = await getLabelOrThrow(req.params.id as string);
    await requireWorkspaceManager(label.workspace_id, req.user!.id);

    const body = req.body as UpdateLabelInput;
    const updated = await updateLabel(label.id, {
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.color !== undefined ? { color: body.color } : {}),
    });
    res.json({ label: updated });
  }),
);

labelsRouter.delete(
  "/:id",
  validateParams(uuidParamSchema),
  asyncHandler(async (req, res) => {
    const label = await getLabelOrThrow(req.params.id as string);
    await requireWorkspaceManager(label.workspace_id, req.user!.id);

    await deleteLabel(label.id);
    res.status(204).send();
  }),
);
