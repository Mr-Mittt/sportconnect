-- SESSION-GROUP-5 review (owner, 2026-11-19): a queue row that is skipped is IGNORED with a reason, not DONE.
--
-- DONE used to mean both "a session was made" and "skipped, nothing made", so a skipped slot (generation was off, the
-- configuration was a draft) could never be queued again. Now DONE means a session exists; IGNORED rows (reason
-- OUTDATED, SUPERSEDED, GENERATION_OFF, RECURRENCE_INACTIVE, GROUP_INACTIVE) are revived by the planner when the slot is
-- wanted again.
-- last_attempt_at: when the generator last tried the slot (set on a failure), for investigation next to attempts and last_error.
-- Existing rows are left as they are (production has none, V096 is unreleased; a development database keeps its DONE rows).
ALTER TABLE group_session_generation_queue ADD COLUMN IF NOT EXISTS ignored_reason VARCHAR(30);
ALTER TABLE group_session_generation_queue ADD COLUMN IF NOT EXISTS last_attempt_at TIMESTAMPTZ;

ALTER TABLE group_session_generation_queue DROP CONSTRAINT IF EXISTS chk_group_session_queue_status;
ALTER TABLE group_session_generation_queue ADD CONSTRAINT chk_group_session_queue_status
    CHECK (status IN ('PENDING', 'DONE', 'FAILED', 'IGNORED'));
ALTER TABLE group_session_generation_queue ADD CONSTRAINT chk_group_session_queue_ignored_reason
    CHECK (ignored_reason IS NULL OR ignored_reason IN
        ('OUTDATED', 'SUPERSEDED', 'GENERATION_OFF', 'RECURRENCE_INACTIVE', 'GROUP_INACTIVE'));
