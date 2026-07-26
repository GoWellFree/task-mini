-- Rollback for 011_reminders_and_recurrence.sql.

drop table if exists task_reminders;
alter table tasks drop constraint if exists tasks_recurrence_until_requires_rule;
alter table tasks drop column if exists recurrence_until;
alter table tasks drop column if exists recurrence_interval;
alter table tasks drop column if exists recurrence_rule;
