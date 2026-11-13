-- SESSION-50: session result records (game logging). One row per recorded result (a game, later a per-player
-- record); the payload is the client's JSON, stored as sent. No foreign keys: tables are domain-scoped.
--
-- sports.result_schema: what one recorded result is for the sport. Client-facing; the server reads only
-- maxRecords. NULL = the sport has no result logging. Not seeded: set through
-- PUT /api/sports/{sportId}/result-schema.
ALTER TABLE sports ADD COLUMN IF NOT EXISTS result_schema JSONB;

-- data: the client's payload (players, sides, winner, scores), opaque to the server; the player ids a request
-- names are checked as JOINED and not stored. No audit table: a deleted record is simply gone.
-- client_request_id: the client's per-add UUID, so a retried request never creates the record twice.
CREATE TABLE session_records (
    id BIGSERIAL PRIMARY KEY,
    session_id BIGINT NOT NULL,
    data JSONB NOT NULL,
    client_request_id UUID NOT NULL,
    created_by UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_by UUID NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_session_records_request UNIQUE (session_id, client_request_id)
);
CREATE INDEX idx_session_records_session ON session_records (session_id, id);
