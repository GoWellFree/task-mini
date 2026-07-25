export interface User {
  id: string;
  telegram_id: number;
  username: string | null;
  first_name: string;
  last_name: string | null;
  created_at: string;
}

export interface Workspace {
  id: string;
  name: string;
  owner_id: string;
  invite_code: string;
  created_at: string;
}

export type WorkspaceRole = "owner" | "member";

export interface WorkspaceMember {
  id: string;
  workspace_id: string;
  user_id: string;
  role: WorkspaceRole;
  created_at: string;
}

export interface WorkspaceMemberWithUser extends WorkspaceMember {
  user: Pick<User, "id" | "username" | "first_name" | "last_name" | "telegram_id">;
}

export type TaskStatus = "todo" | "in_progress" | "done";

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

export interface AuthTokenPayload {
  userId: string;
  telegramId: number;
}

// Augment Express Request with the authenticated user attached by the auth middleware.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: User;
    }
  }
}
