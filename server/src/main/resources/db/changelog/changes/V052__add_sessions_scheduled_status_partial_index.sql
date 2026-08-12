-- SESSION-12: partial index for the generation job's hot findSessionsToStart query
-- (SessionRepository.findSessionsToStart: status = 'SCHEDULED' AND scheduled_start <= :now AND
-- scheduled_end_at > :now), run every 15 minutes by SessionGenerationJob.startOngoingSessions.
-- Sessions are never deleted or purged, so the existing idx_sessions_status_scheduled_start
-- (unscoped across all four SessionStatus values) grows with the table's entire history while
-- the SCHEDULED slice stays comparatively small — a partial index scoped to status = 'SCHEDULED'
-- tracks only that live/pending slice instead, same technique as idx_groups_sport_id_public_active
-- (V047) and idx_sessions_sport_id_standalone (V039). Kept alongside the existing composite index,
-- which still serves findSessionsToComplete's status IN (SCHEDULED, ONGOING) query.

CREATE INDEX idx_sessions_scheduled_status_only ON sessions(scheduled_start)
    WHERE status = 'SCHEDULED';
