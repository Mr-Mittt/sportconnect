-- GROUP-RECUR-1: Per-group toggle for the session-generation job (SESSION-2) — when true, the
-- job keeps the group's next recurring Session instance generated and closes past ones.

ALTER TABLE group_settings ADD COLUMN auto_generate_sessions BOOLEAN NOT NULL DEFAULT false;
