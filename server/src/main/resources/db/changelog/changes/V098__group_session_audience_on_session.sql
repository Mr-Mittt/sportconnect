-- Review change (owner, 2026-11-19): a SPECIFIC group-session audience lives on the session itself, not in a table.
--
-- sessions.group_audience_user_ids: the chosen members as comma-separated UUIDs in one TEXT column. It is written once, read only
-- when the session is cancelled and never queried by an id, so a table (session_audience_members, V094) bought nothing; the
-- uniqueness of the ids is enforced in Java (UuidListConverter) before the value is saved. Null for ALL_MEMBERS, for standalone
-- sessions, and for a SPECIFIC audience that was empty.
--
-- Existing rows are carried over first (a development database may hold some; production has none, V094 is unreleased), then the
-- table is dropped. DROP TABLE removes the rows for good.
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS group_audience_user_ids TEXT;

UPDATE sessions s
SET group_audience_user_ids = (
    SELECT string_agg(m.user_id::text, ',' ORDER BY m.id)
    FROM session_audience_members m
    WHERE m.session_id = s.id)
WHERE s.group_audience = 'SPECIFIC';

DROP TABLE IF EXISTS session_audience_members;
