-- Rollback for 009_task_comments.sql. Destructive: every comment is
-- permanently lost. Never run automatically.

drop table if exists task_comments;
