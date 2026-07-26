-- Refresh-token sessions, so a token can be revoked server-side.
-- Additive only: no existing table or column is modified.
--
-- Rollback: see 001_user_sessions.down.sql

create table if not exists user_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  -- Only ever a SHA-256 hash of the refresh token. The raw token is
  -- returned to the client once and never stored.
  token_hash text not null unique,
  -- Set when the token is rotated or the session is revoked; a session is
  -- usable only while this is null and expires_at is in the future.
  revoked_at timestamptz,
  -- Points at the session that replaced this one, so reuse of an already
  -- rotated token can be detected and the whole chain revoked.
  replaced_by uuid references user_sessions(id) on delete set null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  user_agent text
);

create index if not exists idx_user_sessions_user_id on user_sessions(user_id);
create index if not exists idx_user_sessions_token_hash on user_sessions(token_hash);
-- Supports the worker's cleanup of expired sessions.
create index if not exists idx_user_sessions_expires_at on user_sessions(expires_at);
