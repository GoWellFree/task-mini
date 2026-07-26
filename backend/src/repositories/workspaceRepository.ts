import { supabase } from "../lib/supabase.js";
import type { Workspace, WorkspaceMemberWithUser, WorkspaceRole, WorkspaceType } from "../types/index.js";

/** Raw workspace/workspace_members table access. No business logic, no auth checks. */

export async function listWorkspacesForUser(userId: string): Promise<Workspace[]> {
  const { data, error } = await supabase
    .from("workspace_members")
    .select("workspace:workspaces(*)")
    .eq("user_id", userId);

  if (error) throw error;
  return (data ?? []).map((row) => row.workspace).filter(Boolean) as unknown as Workspace[];
}

export async function getWorkspaceById(id: string): Promise<Workspace | null> {
  const { data } = await supabase.from("workspaces").select("*").eq("id", id).maybeSingle();
  return (data as Workspace | null) ?? null;
}

export async function findWorkspaceByInviteCode(inviteCode: string): Promise<Workspace | null> {
  const { data } = await supabase.from("workspaces").select("*").eq("invite_code", inviteCode).maybeSingle();
  return (data as Workspace | null) ?? null;
}

export async function createWorkspace(
  name: string,
  ownerId: string,
  inviteCode: string,
  type: WorkspaceType = "team",
): Promise<Workspace> {
  const { data, error } = await supabase
    .from("workspaces")
    .insert({ name, owner_id: ownerId, invite_code: inviteCode, type })
    .select("*")
    .single();

  if (error || !data) throw error ?? new Error("Insert returned no row");
  return data as Workspace;
}

/** Hard delete — only ever used to compensate for a failed workspace creation, never for a user-facing delete. */
export async function deleteWorkspace(id: string): Promise<void> {
  const { error } = await supabase.from("workspaces").delete().eq("id", id);
  if (error) throw error;
}

export async function getWorkspaceMembers(workspaceId: string): Promise<WorkspaceMemberWithUser[]> {
  const { data, error } = await supabase
    .from("workspace_members")
    .select("*, user:users(id, username, first_name, last_name, telegram_id)")
    .eq("workspace_id", workspaceId);

  if (error) throw error;
  return (data ?? []) as unknown as WorkspaceMemberWithUser[];
}

export async function addMember(workspaceId: string, userId: string, role: WorkspaceRole): Promise<void> {
  const { error } = await supabase.from("workspace_members").insert({ workspace_id: workspaceId, user_id: userId, role });
  if (error) throw error;
}
