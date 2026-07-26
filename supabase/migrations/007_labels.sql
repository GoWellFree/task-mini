-- Labels: workspace-level tags, attachable to any number of tasks.
-- New tables only — no existing data touched.

create table if not exists labels (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  name text not null,
  color text,
  created_at timestamptz not null default now(),
  unique (workspace_id, name)
);

create index if not exists idx_labels_workspace_id on labels(workspace_id);

create table if not exists task_labels (
  task_id uuid not null references tasks(id) on delete cascade,
  label_id uuid not null references labels(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (task_id, label_id)
);

create index if not exists idx_task_labels_task_id on task_labels(task_id);
create index if not exists idx_task_labels_label_id on task_labels(label_id);
