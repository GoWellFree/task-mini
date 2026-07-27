import type { ProjectStatus, RecurrenceRule, TaskPriority, TaskStatus, Theme, WorkspaceRole, WorkspaceType } from "./enums.js";

export interface User {
  id: string;
  telegram_id: number;
  username: string | null;
  first_name: string;
  last_name: string | null;
  created_at: string;
  display_name: string | null;
  avatar_url: string | null;
  timezone: string;
  locale: string;
  onboarding_completed: boolean;
  last_seen_at: string | null;
  updated_at: string;
  deleted_at: string | null;
}

/** The subset of a user safe to expose to other workspace members. */
export type PublicUser = Pick<User, "id" | "username" | "first_name" | "last_name" | "telegram_id">;

export interface Workspace {
  id: string;
  name: string;
  owner_id: string;
  invite_code: string;
  created_at: string;
  type: WorkspaceType;
}

export interface UserSettings {
  user_id: string;
  default_workspace_id: string | null;
  default_reminder_minutes: number;
  week_starts_on: number;
  daily_digest_enabled: boolean;
  daily_digest_time: string;
  evening_digest_enabled: boolean;
  quiet_hours_start: string | null;
  quiet_hours_end: string | null;
  telegram_notifications_enabled: boolean;
  theme: Theme;
  created_at: string;
  updated_at: string;
}

export interface Project {
  id: string;
  workspace_id: string;
  name: string;
  description: string | null;
  icon: string | null;
  color: string | null;
  status: ProjectStatus;
  owner_id: string;
  start_at: string | null;
  due_at: string | null;
  position: number;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
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
  /** Incremented on every update; PATCH must supply the version it read, or is refused. */
  version: number;
  /** Soft-delete marker. Deleted tasks are excluded from every normal read. */
  deleted_at: string | null;
  project_id: string | null;
  /** Self-reference for subtasks. */
  parent_task_id: string | null;
  priority: TaskPriority;
  start_at: string | null;
  /** Set automatically when status becomes 'done', cleared when it moves away from it. */
  completed_at: string | null;
  estimate_minutes: number | null;
  actual_minutes: number | null;
  position: number;
  /** Archived tasks stay out of normal views but, unlike deleted_at, are not headed for deletion. */
  archived_at: string | null;
  /** Null means "does not recur". Set, completing the task rolls it to its next occurrence instead of finishing it. */
  recurrence_rule: RecurrenceRule | null;
  recurrence_interval: number;
  /** Once the next occurrence would fall after this, completing the task finishes it normally instead of rolling further. */
  recurrence_until: string | null;
}

/** Task as returned by list endpoints that join the workspace name. */
export interface TaskWithWorkspace extends Task {
  workspace?: { name: string };
}

export interface TaskAssignee {
  id: string;
  task_id: string;
  user_id: string;
  assigned_at: string;
  assigned_by: string | null;
}

export interface TaskAssigneeWithUser extends TaskAssignee {
  user: PublicUser;
}

/** Records that a due-date reminder was already sent to this recipient for this task, so the worker never double-sends. */
export interface TaskReminder {
  task_id: string;
  user_id: string;
  sent_at: string;
}

/** `task_id` depends on (is blocked by) `depends_on_task_id` — the latter should be done first. */
export interface TaskDependency {
  task_id: string;
  depends_on_task_id: string;
  created_at: string;
}

export interface Label {
  id: string;
  workspace_id: string;
  name: string;
  color: string | null;
  created_at: string;
}

export interface ChecklistItem {
  id: string;
  task_id: string;
  title: string;
  is_done: boolean;
  position: number;
  created_at: string;
  completed_at: string | null;
}

export interface TaskComment {
  id: string;
  task_id: string;
  author_id: string;
  parent_comment_id: string | null;
  body: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface TaskCommentWithAuthor extends TaskComment {
  author: PublicUser;
}

export interface AuthTokenPayload {
  userId: string;
  telegramId: number;
}

/** Issued on login and on every refresh. */
export interface AuthTokens {
  accessToken: string;
  /** Opaque random string — not a JWT. Only its hash is stored server-side. */
  refreshToken: string;
  /** Access-token lifetime in seconds, so the client can refresh proactively. */
  expiresIn: number;
}

export interface AuthResponse extends AuthTokens {
  user: User;
  startParam?: string;
}

export interface UserSession {
  id: string;
  user_id: string;
  revoked_at: string | null;
  expires_at: string;
  created_at: string;
  last_used_at: string | null;
  user_agent: string | null;
}
