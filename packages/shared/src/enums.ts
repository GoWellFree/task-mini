// Status/role vocabularies shared by frontend, backend and request validation.
// These arrays are the single source of truth and MUST stay in step with the
// SQL check constraints in supabase/. They currently mirror the live schema;
// the wider vocabularies from the spec (admin/manager/viewer roles,
// inbox/waiting/review/cancelled statuses, priorities, project statuses)
// land together with the migrations that add them, so that the API never
// accepts a value the database would reject.

export const WORKSPACE_ROLE_VALUES = ["owner", "member"] as const;
export type WorkspaceRole = (typeof WORKSPACE_ROLE_VALUES)[number];

export const TASK_STATUS_VALUES = ["todo", "in_progress", "done"] as const;
export type TaskStatus = (typeof TASK_STATUS_VALUES)[number];
