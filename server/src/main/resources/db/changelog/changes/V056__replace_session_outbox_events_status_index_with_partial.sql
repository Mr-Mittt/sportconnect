-- SESSION-17: idx_session_outbox_events_status_created (V054) is a full composite index covering
-- every row regardless of status. SessionOutboxRelayJob.drain() only ever queries
-- status = 'PENDING' (findTop50ByStatusOrderByCreatedAtAsc), and SENT rows are never deleted or
-- archived, so the unscoped index keeps growing with the table's entire history while the
-- PENDING slice stays near-empty in steady state (drained within one 10s relay tick) — same
-- technique as idx_sessions_scheduled_status_only (V052) and idx_groups_sport_id_public_active
-- (V047). No other query needs the dropped index, so it's replaced outright, not kept alongside.
DROP INDEX idx_session_outbox_events_status_created;

CREATE INDEX idx_session_outbox_events_pending_created ON session_outbox_events(created_at)
    WHERE status = 'PENDING';
