-- Multiple assignees per task. Additive only: tasks.assignee_id is kept as
-- a "primary assignee" mirror for existing callers during the transition
-- (per the spec: remove it only after frontend fully migrates), backfilled
-- here from its current values so both models agree from the start.

create table if not exists task_assignees (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references tasks(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  assigned_at timestamptz not null default now(),
  assigned_by uuid references users(id) on delete set null,
  unique (task_id, user_id)
);

create index if not exists idx_task_assignees_task_id on task_assignees(task_id);
create index if not exists idx_task_assignees_user_id on task_assignees(user_id);

insert into task_assignees (task_id, user_id, assigned_by)
select id, assignee_id, creator_id
from tasks
where assignee_id is not null
on conflict (task_id, user_id) do nothing;
