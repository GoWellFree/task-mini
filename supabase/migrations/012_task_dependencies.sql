-- Task dependencies: task_id depends on (is blocked by) depends_on_task_id.
-- Additive only — a new table, nothing existing is touched.

create table if not exists task_dependencies (
  task_id uuid not null references tasks(id) on delete cascade,
  depends_on_task_id uuid not null references tasks(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (task_id, depends_on_task_id),
  check (task_id <> depends_on_task_id)
);

create index if not exists idx_task_dependencies_depends_on on task_dependencies(depends_on_task_id);
