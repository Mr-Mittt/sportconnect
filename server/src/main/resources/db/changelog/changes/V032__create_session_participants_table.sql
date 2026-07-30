-- SESSION-1: Minimal join/leave tracking for a session. A row is kept (status flipped) on
-- leave rather than deleted, so history isn't lost.

CREATE TABLE session_participants (
    id BIGSERIAL PRIMARY KEY,
    session_id BIGINT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id),
    status VARCHAR(10) NOT NULL DEFAULT 'JOINED',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_session_user UNIQUE (session_id, user_id)
);

COMMENT ON TABLE session_participants IS 'Join/leave tracking for a session (SESSION-1)';

CREATE INDEX idx_session_participants_session_id ON session_participants(session_id);
CREATE INDEX idx_session_participants_user_id ON session_participants(user_id);
