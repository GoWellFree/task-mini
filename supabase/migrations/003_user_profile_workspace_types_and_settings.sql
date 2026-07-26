-- User profile fields, workspace types, expanded roles, and per-user settings.
-- Additive only: every new column is nullable or has a default, so existing
-- rows keep their current meaning. workspace_members.role's check constraint
-- is widened (existing 'owner'/'member' values remain valid), not narrowed.

alter table users add column if not exists display_name text;
alter table users add column if not exists avatar_url text;
alter table users add column if not exists timezone text not null default 'UTC';
alter table users add column if not exists locale text not null default 'ru';
alter table users add column if not exists onboarding_completed boolean not null default false;
alter table users add column if not exists last_seen_at timestamptz;
alter table users add column if not exists updated_at timestamptz not null default now();
alter table users add column if not exists deleted_at timestamptz;

alter table workspaces add column if not exists type text not null default 'team'
  check (type in ('personal', 'team', 'family', 'education', 'other'));

alter table workspace_members drop constraint if exists workspace_members_role_check;
alter table workspace_members add constraint workspace_members_role_check
  check (role in ('owner', 'admin', 'manager', 'member', 'viewer'));

create table if not exists user_settings (
  user_id uuid primary key references users(id) on delete cascade,
  default_workspace_id uuid references workspaces(id) on delete set null,
  default_reminder_minutes integer not null default 30,
  week_starts_on smallint not null default 1 check (week_starts_on between 0 and 6),
  daily_digest_enabled boolean not null default false,
  daily_digest_time time not null default '09:00',
  evening_digest_enabled boolean not null default false,
  quiet_hours_start time,
  quiet_hours_end time,
  telegram_notifications_enabled boolean not null default true,
  theme text not null default 'system' check (theme in ('system', 'light', 'dark')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
