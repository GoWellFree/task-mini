-- Task attachments: files uploaded to a task, stored in a private Supabase
-- Storage bucket. All access goes through the backend (service-role key +
-- app-level permission checks, same model as every other table here — see
-- lib/supabase.ts), never a public URL or client-side Storage access, so the
-- bucket itself stays private and needs no RLS policies of its own.

create table if not exists task_attachments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references tasks(id) on delete cascade,
  uploader_id uuid not null references users(id) on delete cascade,
  file_name text not null,
  file_size integer not null,
  mime_type text not null,
  storage_path text not null unique,
  created_at timestamptz not null default now()
);

create index if not exists idx_task_attachments_task_id on task_attachments(task_id);

insert into storage.buckets (id, name, public)
values ('task-attachments', 'task-attachments', false)
on conflict (id) do nothing;
