-- SESSION-GROUP-5: regular group sessions generated from the recurrence configurations (V095).
--
-- sessions.recurrence_id / occurrence_date: a generated ("regular") session records which recurrence made it and for which
--   local date. NULL recurrence_id = a custom session (or one generated before this change). The unique index on the pair is
--   the duplicate guard that replaced the dropped unique (group_id, scheduled_start) key (V094): rows with a NULL
--   recurrence_id never collide (NULLs are distinct), so only regular sessions are constrained. No FK on recurrence_id: a
--   deleted recurrence leaves its sessions (SESSION-GROUP-6 decides what to do with them).
-- group_session_generation_queue: the slots still to be generated. One row per (recurrence, local date); PENDING rows are
--   drained in target_start order, a failure is retried with a backoff (attempts, next_attempt_at) and ends FAILED after 5.
--   Deleting a recurrence drops its queue rows (same domain, cascade).
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS recurrence_id BIGINT;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS occurrence_date DATE;
CREATE UNIQUE INDEX IF NOT EXISTS uq_sessions_recurrence_occurrence ON sessions (recurrence_id, occurrence_date);

CREATE TABLE group_session_generation_queue (
    id BIGSERIAL PRIMARY KEY,
    recurrence_id BIGINT NOT NULL REFERENCES group_session_recurrences(id) ON DELETE CASCADE,
    occurrence_date DATE NOT NULL,
    target_start TIMESTAMPTZ NOT NULL,
    status VARCHAR(10) NOT NULL DEFAULT 'PENDING',
    attempts INTEGER NOT NULL DEFAULT 0,
    next_attempt_at TIMESTAMPTZ NOT NULL,
    last_error VARCHAR(500),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP,
    CONSTRAINT unique_group_session_queue_item UNIQUE (recurrence_id, occurrence_date),
    CONSTRAINT chk_group_session_queue_status CHECK (status IN ('PENDING', 'DONE', 'FAILED'))
);

-- The drain: due PENDING rows, soonest target first.
CREATE INDEX idx_group_session_queue_due ON group_session_generation_queue (status, next_attempt_at, target_start);
