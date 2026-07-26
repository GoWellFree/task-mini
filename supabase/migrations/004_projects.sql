-- Projects: a grouping of tasks within a workspace.
-- New table only — no existing data is touched.

create table if not exists projects (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  name text not null,
  description text,
  icon text,
  color text,
  status text not null default 'planning'
    check (status in ('planning', 'active', 'paused', 'completed', 'archived')),
  owner_id uuid not null references users(id) on delete cascade,
  start_at timestamptz,
  due_at timestamptz,
  position integer not null default 0,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_projects_workspace_id on projects(workspace_id);
create index if not exists idx_projects_owner_id on projects(owner_id);
create index if not exists idx_projects_status on projects(status);
