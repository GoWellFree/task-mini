-- Rollback for 002_task_soft_delete_and_version.sql.
-- Destructive: any soft-deleted task's deleted_at is permanently lost, and
-- optimistic-locking history (version) is discarded.
-- Never run automatically; apply only with explicit confirmation.

drop index if exists idx_tasks_deleted_at;
alter table tasks drop column if exists deleted_at;
alter table tasks drop column if exists version;
