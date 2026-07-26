-- Rollback for 005_extend_tasks.sql.
-- Destructive: priority, scheduling, time tracking, project/subtask links
-- and archive state are permanently lost. Never run automatically.

alter table tasks drop constraint if exists tasks_status_check;
alter table tasks add constraint tasks_status_check
  check (status in ('todo', 'in_progress', 'done'));
-- Any row with status inbox/waiting/review/cancelled would now violate the
-- constraint above; fix those rows manually before/while rolling back.

drop index if exists idx_tasks_archived_at;
drop index if exists idx_tasks_priority;
drop index if exists idx_tasks_parent_task_id;
drop index if exists idx_tasks_project_id;

alter table tasks drop column if exists archived_at;
alter table tasks drop column if exists position;
alter table tasks drop column if exists actual_minutes;
alter table tasks drop column if exists estimate_minutes;
alter table tasks drop column if exists completed_at;
alter table tasks drop column if exists start_at;
alter table tasks drop column if exists priority;
alter table tasks drop column if exists parent_task_id;
alter table tasks drop column if exists project_id;
