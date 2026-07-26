-- Soft delete and optimistic concurrency for tasks.
-- Additive only: existing rows get version=1, deleted_at=null (both defaults),
-- so no existing row changes meaning. No column is dropped or renamed.
--
-- Rollback: see 002_task_soft_delete_and_version.down.sql

alter table tasks add column if not exists version integer not null default 1;
alter table tasks add column if not exists deleted_at timestamptz;

-- Every read query now filters `deleted_at is null`; this index keeps that
-- filter cheap as the trash grows relative to active tasks.
create index if not exists idx_tasks_deleted_at on tasks(deleted_at);
