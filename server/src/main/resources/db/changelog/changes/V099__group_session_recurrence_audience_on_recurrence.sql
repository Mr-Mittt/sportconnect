-- Review change (owner, 2026-11-19), the same reasoning as V098: the chosen members of a SPECIFIC recurrence audience live on the
-- recurrence itself, not in a table.
--
-- group_session_recurrences.audience_user_ids: the chosen members as comma-separated UUIDs in one TEXT column. A configuration's
-- audience is always read and replaced as a whole and never queried by an id, so group_session_recurrence_members (V095) bought
-- nothing but a delete + flush + insert on every update and a second query on every list; the uniqueness of the ids is enforced
-- in Java (UuidListConverter) before the value is saved. Null for ALL_MEMBERS.
--
-- Existing rows are carried over first (a development database may hold some; production has none, V095 is unreleased), then the
-- table is dropped. DROP TABLE removes the rows for good.
ALTER TABLE group_session_recurrences ADD COLUMN IF NOT EXISTS audience_user_ids TEXT;

UPDATE group_session_recurrences r
SET audience_user_ids = (
    SELECT string_agg(m.user_id::text, ',' ORDER BY m.id)
    FROM group_session_recurrence_members m
    WHERE m.recurrence_id = r.id)
WHERE r.audience = 'SPECIFIC';

DROP TABLE IF EXISTS group_session_recurrence_members;
