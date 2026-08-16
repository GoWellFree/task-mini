-- Tracks which daily/evening digests have already been sent, keyed by the
-- recipient's own LOCAL calendar date (not UTC), so the worker can tick every
-- minute without re-sending the same day's digest to a user more than once.
create table if not exists user_digest_log (
  user_id uuid not null references users(id) on delete cascade,
  digest_type text not null check (digest_type in ('daily', 'evening')),
  sent_on date not null,
  sent_at timestamptz not null default now(),
  primary key (user_id, digest_type, sent_on)
);
