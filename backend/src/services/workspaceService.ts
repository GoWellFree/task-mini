import { randomBytes } from "node:crypto";
import * as workspaceRepository from "../repositories/workspaceRepository.js";
import type { Workspace } from "../types/index.js";

function generateInviteCode(): string {
  return randomBytes(6).toString("hex");
}

/**
 * Creates a workspace and its owner membership. Supabase-js has no
 * multi-statement transaction, so if the membership insert fails after the
 * workspace insert already succeeded, the workspace is deleted again rather
 * than left behind: a workspace with no owner membership is permanently
 * inaccessible (every read requires membership), which is worse than the
 * create simply failing.
 */
export async function createWorkspaceWithOwner(name: string, ownerId: string): Promise<Workspace> {
  const workspace = await workspaceRepository.createWorkspace(name, ownerId, generateInviteCode());

  try {
    await workspaceRepository.addMember(workspace.id, ownerId, "owner");
  } catch (err) {
    try {
      await workspaceRepository.deleteWorkspace(workspace.id);
    } catch (cleanupErr) {
      console.error(
        `Failed to clean up orphaned workspace ${workspace.id} after its owner membership insert failed:`,
        cleanupErr,
      );
    }
    throw err;
  }

  return workspace;
}
