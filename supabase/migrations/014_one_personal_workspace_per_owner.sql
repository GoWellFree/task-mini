-- Closes a TOCTOU race in onboarding: two concurrent /api/auth/telegram
-- calls for the same brand-new user can both observe "no existing user"
-- before either finishes creating one (the users table's own upsert
-- dedupes correctly via its telegram_id unique constraint, but the
-- in-process `isNew` flag each request computed from its own read does
-- not), so both would call onboardNewUser -> createPersonalWorkspace for
-- the same owner. This index makes the loser's insert fail atomically
-- instead of silently creating a duplicate; workspaceService.createPersonalWorkspace
-- catches that and returns the winner's workspace instead.
create unique index if not exists idx_workspaces_one_personal_per_owner
  on workspaces (owner_id)
  where type = 'personal';
