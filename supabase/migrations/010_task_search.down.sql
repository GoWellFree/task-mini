-- Rollback for 010_task_search.sql.
-- Safe to drop the extension too: nothing else in the schema uses pg_trgm
-- (re-check that before running this if a later migration adds another
-- trigram index elsewhere).

drop index if exists idx_tasks_title_trgm;
drop index if exists idx_tasks_search_vector;
alter table tasks drop column if exists search_vector;
drop extension if exists pg_trgm;
