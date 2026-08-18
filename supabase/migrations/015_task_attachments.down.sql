-- Rollback for 015_task_attachments.sql. Destructive: every attachment's
-- metadata row is permanently lost. Never run automatically.
--
-- Deliberately does NOT touch storage.buckets/storage.objects: Supabase
-- blocks direct SQL DELETE against its own Storage tables ("Direct deletion
-- from storage tables is not allowed. Use the Storage API instead."), so
-- any actual blob cleanup has to go through the Storage API (or dashboard),
-- not a .sql file. The 'task-attachments' bucket is left in place, empty
-- and unused, which is harmless.

drop table if exists task_attachments;
