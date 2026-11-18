-- SESSION-GROUP-1: a group member creates a custom group session, with an audience; two sessions of a group may share a start.
--
-- 1. The unique key (group_id, scheduled_start) is dropped: the owner decided (2026-11-19) that any number of sessions of a
--    group may start at the same time (a custom session beside a regular one, two regular slots at the same hour).
--    Duplicate protection for generated sessions moves to SESSION-GROUP-5's (recurrence_id, occurrence_date) key.
--    The constraint also gave (group_id, scheduled_start) an index that the group listing and the Discover plans use
--    (documentation/md/adr/DISCOVER_SCHEDULED_START_FILTER_ADR.md), so the same columns stay indexed, non-unique.
-- 2. sessions.group_audience: who a group session was made for: ALL_MEMBERS or SPECIFIC. NULL for a standalone session and
--    for a group session created before this change (read as ALL_MEMBERS).
-- 3. session_audience_members: the chosen members of a SPECIFIC audience. It decides only who is notified (creation, and
--    a cancel); every member can still see and join the session, and no INVITED row exists. session_id is in-domain and
--    keeps its FK; user_id is cross-domain and carries none.
ALTER TABLE sessions DROP CONSTRAINT IF EXISTS unique_group_session_start;
CREATE INDEX IF NOT EXISTS idx_sessions_group_scheduled_start ON sessions (group_id, scheduled_start);

ALTER TABLE sessions ADD COLUMN IF NOT EXISTS group_audience VARCHAR(20);

CREATE TABLE IF NOT EXISTS session_audience_members (
    id BIGSERIAL PRIMARY KEY,
    session_id BIGINT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    user_id UUID NOT NULL,
    CONSTRAINT unique_session_audience_member UNIQUE (session_id, user_id)
);
