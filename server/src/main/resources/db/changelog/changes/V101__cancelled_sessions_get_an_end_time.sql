-- SESSION-GROUP-12 part B (owner, 2026-11-20): a cancelled session always has an end time.
--
-- scheduled_end_at is set only when a session has a duration, so a PREPARING draft has none, and cancelling a session
-- never set one. A list ordered or grouped by end time (the group Sessions tab history) could not place such a row.
-- From now on every cancel path sets the end to the start when there is none (Session.endAtStartIfMissing); this
-- backfills the rows cancelled before. A cancelled session that had an end keeps it; a COMPLETED session without a
-- duration is left alone (the history queries read COALESCE(scheduled_end_at, scheduled_start)).
UPDATE sessions
SET scheduled_end_at = scheduled_start
WHERE status = 'CANCELLED'
  AND scheduled_end_at IS NULL;
