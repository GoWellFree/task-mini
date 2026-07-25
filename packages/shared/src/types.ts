import type { TaskStatus, WorkspaceRole } from "./enums.js";

export interface User {
  id: string;
  telegram_id: number;
  username: string | null;
  first_name: string;
  last_name: string | null;
  created_at: string;
}

/** The subset of a user safe to expose to other workspace members. */
export type PublicUser = Pick<User, "id" | "username" | "first_name" | "last_name" | "telegram_id">;

export interface Workspace {
  id: string;
  name: string;
  owner_id: string;
  invite_code: string;
  created_at: string;
}

export interface WorkspaceMember {
  id: string;
  workspace_id: string;
  user_id: string;
  role: WorkspaceRole;
  created_at: string;
}

export interface WorkspaceMemberWithUser extends WorkspaceMember {
  user: PublicUser;
}

export interface Task {
  id: string;
  workspace_id: string;
  title: string;
  description: string | null;
  creator_id: string;
  assignee_id: string | null;
  status: TaskStatus;
  due_at: string | null;
  created_at: string;
  updated_at: string;
}

/** Task as returned by list endpoints that join the workspace name. */
export interface TaskWithWorkspace extends Task {
  workspace?: { name: string };
}

export interface AuthTokenPayload {
  userId: string;
  telegramId: number;
}
