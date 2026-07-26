-- Rollback for 003_user_profile_workspace_types_and_settings.sql.
-- Destructive: user_settings rows, workspace type classification, and any
-- role beyond owner/member are permanently lost. Never run automatically.

drop table if exists user_settings;

alter table workspace_members drop constraint if exists workspace_members_role_check;
alter table workspace_members add constraint workspace_members_role_check
  check (role in ('owner', 'member'));
-- Any row with role admin/manager/viewer would now violate the constraint
-- above; the down migration intentionally does not silently reassign roles,
-- so fix those rows manually before/while rolling back if any exist.

alter table workspaces drop column if exists type;

alter table users drop column if exists deleted_at;
alter table users drop column if exists updated_at;
alter table users drop column if exists last_seen_at;
alter table users drop column if exists onboarding_completed;
alter table users drop column if exists locale;
alter table users drop column if exists timezone;
alter table users drop column if exists avatar_url;
alter table users drop column if exists display_name;
