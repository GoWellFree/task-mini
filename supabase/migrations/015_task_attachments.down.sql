-- Rollback for 015_task_attachments.sql. Destructive: every uploaded file
-- and its metadata is permanently lost. Never run automatically.

delete from storage.objects where bucket_id = 'task-attachments';
delete from storage.buckets where id = 'task-attachments';
drop table if exists task_attachments;
