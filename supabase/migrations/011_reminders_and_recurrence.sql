-- Recurrence: a task recurs on a simple daily/weekly/monthly/yearly cadence.
-- Completing a recurring task rolls the SAME row forward to the next
-- occurrence (status reset, due_at advanced) rather than spawning new rows —
-- the simplest model, and how most task-manager apps handle this in
-- practice. Additive only: existing tasks get recurrence_rule = null
-- (not recurring) and are otherwise untouched.

alter table tasks add column if not exists recurrence_rule text
  check (recurrence_rule is null or recurrence_rule in ('daily', 'weekly', 'monthly', 'yearly'));
alter table tasks add column if not exists recurrence_interval integer not null default 1
  check (recurrence_interval >= 1);
alter table tasks add column if not exists recurrence_until timestamptz;

alter table tasks add constraint tasks_recurrence_until_requires_rule
  check (recurrence_until is null or recurrence_rule is not null);

-- Per-(task, user) reminder send tracking, so the worker's periodic tick
-- never double-sends the same reminder. One row per recipient per task —
-- a task can have several assignees (task_assignees), each an independent
-- recipient with their own reminder lead time (user_settings.default_reminder_minutes).
create table if not exists task_reminders (
  task_id uuid not null references tasks(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  sent_at timestamptz not null default now(),
  primary key (task_id, user_id)
);

create index if not exists idx_task_reminders_task_id on task_reminders(task_id);
