-- SESSION-78 (owner, 2026-11-25): a group's switch for its statistics and its leaderboard, on the group's existing
-- regular-session settings row. Off by default (no row means off too), so after the deploy no group's member statistics or
-- head-to-head are written until its owner or an admin switches it on. PostgreSQL fills the default without rewriting the table.
ALTER TABLE group_session_settings ADD COLUMN statistics_enabled BOOLEAN NOT NULL DEFAULT FALSE;
