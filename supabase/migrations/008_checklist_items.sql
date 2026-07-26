-- Checklist items: an ordered, completable sub-list within a task.
-- New table only — no existing data touched.

create table if not exists checklist_items (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references tasks(id) on delete cascade,
  title text not null,
  is_done boolean not null default false,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists idx_checklist_items_task_id on checklist_items(task_id);
