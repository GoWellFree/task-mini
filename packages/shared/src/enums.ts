// Status/role vocabularies shared by frontend, backend and request validation.
// These arrays are the single source of truth and MUST stay in step with the
// SQL check constraints in supabase/. They currently mirror the live schema;
// the wider vocabularies from the spec (inbox/waiting/review/cancelled
// statuses, priorities, project statuses) land together with the migrations
// that add them, so that the API never accepts a value the database would
// reject.

// Ordered from most to least privileged. Only 'owner' vs 'admin' has any
// distinct behavior wired up so far (see workspacePermissions.ts); 'manager'
// currently behaves like 'member' until project-level management exists to
// give it a distinct scope, and 'viewer' is enforced as read-only.
export const WORKSPACE_ROLE_VALUES = ["owner", "admin", "manager", "member", "viewer"] as const;
export type WorkspaceRole = (typeof WORKSPACE_ROLE_VALUES)[number];

export const WORKSPACE_TYPE_VALUES = ["personal", "team", "family", "education", "other"] as const;
export type WorkspaceType = (typeof WORKSPACE_TYPE_VALUES)[number];

export const TASK_STATUS_VALUES = ["todo", "in_progress", "done"] as const;
export type TaskStatus = (typeof TASK_STATUS_VALUES)[number];

export const THEME_VALUES = ["system", "light", "dark"] as const;
export type Theme = (typeof THEME_VALUES)[number];
