-- Full-text search (Russian config) plus a trigram fallback for tasks.
-- FTS matches whole words/stems ("задачи" matches "задача") and ranks by
-- relevance; pg_trgm covers what FTS structurally can't — substrings that
-- aren't on a word/lexeme boundary and typos — so the app queries FTS first
-- and only falls back to trigram-accelerated ILIKE when FTS finds nothing.
-- Additive only: existing rows are unaffected, the generated column
-- backfills itself from title/description.

create extension if not exists pg_trgm;

alter table tasks add column if not exists search_vector tsvector
  generated always as (
    setweight(to_tsvector('russian', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('russian', coalesce(description, '')), 'B')
  ) stored;

create index if not exists idx_tasks_search_vector on tasks using gin(search_vector);

-- Scoped to title only: title is short and is what a search box match is
-- expected against, and a trigram GIN index over the (much larger)
-- description column would cost more to maintain for less benefit given FTS
-- (weight B) already covers description.
create index if not exists idx_tasks_title_trgm on tasks using gin(title gin_trgm_ops);
