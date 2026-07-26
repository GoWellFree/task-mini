-- Extends tasks with project linking, subtasks, priority, scheduling,
-- time tracking, and archiving. Additive only: every new column is
-- nullable or has a default, so existing rows keep their current meaning.
-- The status check constraint is widened, not narrowed — 'todo',
-- 'in_progress' and 'done' (the only values ever used so far) remain valid.

alter table tasks add column if not exists project_id uuid references projects(id) on delete set null;
alter table tasks add column if not exists parent_task_id uuid references tasks(id) on delete set null;
alter table tasks add column if not exists priority text not null default 'none'
  check (priority in ('none', 'low', 'medium', 'high', 'urgent'));
alter table tasks add column if not exists start_at timestamptz;
alter table tasks add column if not exists completed_at timestamptz;
alter table tasks add column if not exists estimate_minutes integer check (estimate_minutes is null or estimate_minutes >= 0);
alter table tasks add column if not exists actual_minutes integer check (actual_minutes is null or actual_minutes >= 0);
alter table tasks add column if not exists position integer not null default 0;
alter table tasks add column if not exists archived_at timestamptz;

alter table tasks drop constraint if exists tasks_status_check;
alter table tasks add constraint tasks_status_check
  check (status in ('inbox', 'todo', 'in_progress', 'waiting', 'review', 'done', 'cancelled'));

create index if not exists idx_tasks_project_id on tasks(project_id);
create index if not exists idx_tasks_parent_task_id on tasks(parent_task_id);
create index if not exists idx_tasks_priority on tasks(priority);
create index if not exists idx_tasks_archived_at on tasks(archived_at);
