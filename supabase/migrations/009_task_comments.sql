-- Task comments, with one level of replies via parent_comment_id.
-- New table only — no existing data touched.

create table if not exists task_comments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references tasks(id) on delete cascade,
  author_id uuid not null references users(id) on delete cascade,
  parent_comment_id uuid references task_comments(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists idx_task_comments_task_id on task_comments(task_id);
create index if not exists idx_task_comments_parent_comment_id on task_comments(parent_comment_id);
