-- Rollback for 001_user_sessions.sql.
-- Destructive: drops all refresh-token sessions, logging every user out.
-- Never run automatically; apply only with explicit confirmation.

drop table if exists user_sessions;
