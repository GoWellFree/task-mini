-- Rollback for 007_labels.sql. Destructive: every label and its task
-- attachments are permanently lost. Never run automatically.

drop table if exists task_labels;
drop table if exists labels;
