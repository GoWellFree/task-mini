-- Rollback for 004_projects.sql. Destructive: every project is permanently
-- lost (tasks are unaffected — project_id doesn't exist on tasks until
-- migration 005). Never run automatically.

drop table if exists projects;
