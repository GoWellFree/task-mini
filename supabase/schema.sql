-- Task Mini — minimal schema. All access goes through the backend
-- (service role key), so Row Level Security is intentionally left off for MVP.

create extension if not exists "pgcrypto";

-- ========== users ==========
create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  telegram_id bigint not null unique,
  username text,
  first_name text not null,
  last_name text,
  created_at timestamptz not null default now()
);

create index if not exists idx_users_telegram_id on users(telegram_id);

-- ========== workspaces ==========
create table if not exists workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_id uuid not null references users(id) on delete cascade,
  invite_code text not null unique,
  created_at timestamptz not null default now()
);

create index if not exists idx_workspaces_owner_id on workspaces(owner_id);
create index if not exists idx_workspaces_invite_code on workspaces(invite_code);

-- ========== workspace_members ==========
create table if not exists workspace_members (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  created_at timestamptz not null default now(),
  unique (workspace_id, user_id)
);

create index if not exists idx_workspace_members_workspace_id on workspace_members(workspace_id);
create index if not exists idx_workspace_members_user_id on workspace_members(user_id);

-- ========== tasks ==========
create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  title text not null,
  description text,
  creator_id uuid not null references users(id) on delete cascade,
  assignee_id uuid references users(id) on delete set null,
  status text not null default 'todo' check (status in ('todo', 'in_progress', 'done')),
  due_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_tasks_workspace_id on tasks(workspace_id);
create index if not exists idx_tasks_assignee_id on tasks(assignee_id);
create index if not exists idx_tasks_creator_id on tasks(creator_id);
create index if not exists idx_tasks_status on tasks(status);
create index if not exists idx_tasks_due_at on tasks(due_at);
