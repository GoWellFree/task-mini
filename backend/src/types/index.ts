import type { User } from "@task-mini/shared";

export type {
  AuthTokenPayload,
  Project,
  PublicUser,
  Task,
  TaskAssignee,
  TaskAssigneeWithUser,
  TaskStatus,
  TaskWithWorkspace,
  User,
  UserSettings,
  Workspace,
  WorkspaceMember,
  WorkspaceMemberWithUser,
  WorkspaceRole,
  WorkspaceType,
} from "@task-mini/shared";

// Augment Express Request with the authenticated user attached by the auth middleware.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: User;
      requestId?: string;
    }
  }
}
