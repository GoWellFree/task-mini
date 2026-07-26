-- Rollback for 006_task_assignees.sql. Destructive: any task with more than
-- one assignee loses everyone but whichever one tasks.assignee_id still
-- names. Never run automatically.

drop table if exists task_assignees;
