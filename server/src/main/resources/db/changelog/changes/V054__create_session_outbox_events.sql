-- SESSION-15: session-impl's own outbox table, built on common's OutboxEvent shape (C3).
-- No FKs — same domain-scoped, ID-only convention as every other outbox/cross-domain table.
CREATE TABLE session_outbox_events (
    id BIGSERIAL PRIMARY KEY,
    event_type VARCHAR(100) NOT NULL,
    payload TEXT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    attempt_count INTEGER NOT NULL DEFAULT 0,
    last_attempt_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    sent_at TIMESTAMP
);

-- SessionOutboxRelayJob's hot polling query
CREATE INDEX idx_session_outbox_events_status_created ON session_outbox_events(status, created_at);
