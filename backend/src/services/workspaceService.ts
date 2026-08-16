import { randomBytes } from "node:crypto";
import * as workspaceRepository from "../repositories/workspaceRepository.js";
import type { Workspace, WorkspaceType } from "../types/index.js";

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
export async function createWorkspaceWithOwner(
  name: string,
  ownerId: string,
  type: WorkspaceType = "team",
): Promise<Workspace> {
  const workspace = await workspaceRepository.createWorkspace(name, ownerId, generateInviteCode(), type);

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

const POSTGRES_UNIQUE_VIOLATION = "23505";

function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && "code" in err && (err as { code?: unknown }).code === POSTGRES_UNIQUE_VIOLATION;
}

/**
 * Every user gets exactly one of these, created once at registration (see
 * onboardingService). Two concurrent first-logins for the same brand-new
 * user can both observe "no existing user" before either finishes creating
 * one, so both can reach this call for the same ownerId — migration 014's
 * partial unique index on (owner_id) where type='personal' makes the
 * loser's insert fail atomically instead of silently creating a duplicate;
 * that failure is caught here and treated as success, handing back the
 * workspace the winner actually created.
 */
export async function createPersonalWorkspace(ownerId: string): Promise<Workspace> {
  try {
    return await createWorkspaceWithOwner("Личное пространство", ownerId, "personal");
  } catch (err) {
    if (isUniqueViolation(err)) {
      const existing = await workspaceRepository.findPersonalWorkspaceByOwner(ownerId);
      if (existing) return existing;
    }
    throw err;
  }
}
