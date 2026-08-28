-- U13: user-impl's own outbox table, built on common's OutboxEvent shape (C3), same pattern as
-- session-impl's session_outbox_events (V054). Written in the same transaction as the friend-request
-- write that triggers it (sendFriendRequest / acceptFriendRequest), drained to the sportconnect.events
-- exchange by UserOutboxRelayJob. No FKs — domain-scoped, ID-only, same as every other outbox table.
CREATE TABLE user_outbox_events (
    id BIGSERIAL PRIMARY KEY,
    event_type VARCHAR(100) NOT NULL,
    payload TEXT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    attempt_count INTEGER NOT NULL DEFAULT 0,
    last_attempt_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    sent_at TIMESTAMP
);

-- UserOutboxRelayJob.drain() only ever queries status = 'PENDING'
-- (findTop50ByStatusOrderByCreatedAtAsc). PENDING rows are drained within one 10s relay tick and
-- SENT rows are never deleted, so the live slice stays near-empty while history grows unbounded —
-- a partial index keeps the hot query off the dead weight. Adopts SESSION-17's improved shape from
-- the start rather than shipping a full composite index and replacing it later.
CREATE INDEX idx_user_outbox_events_pending_created ON user_outbox_events(created_at)
    WHERE status = 'PENDING';
