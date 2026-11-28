-- SESSION-55 slice 1 (owner, 2026-11-27/28): group seasons, a group's period of up to 31 days with its own statistics and board.
--
-- group_seasons          one row per season. Dates are LOCAL dates in `timezone`, a snapshot of the group's timezone at creation (B25),
--                        so a later region change of the group never moves an existing season. `stats_config` is the full stat list
--                        ({columns, config}) and `ranking_rule` the sort and require lists per kind ({SINGLE: {sort, require}, ...}),
--                        both copied from the group's effective ones at creation and editable until the season starts (a pre-fill,
--                        never a live link). `post_id` is the season's SEASON_POST anchor (the comment thread and the likes), no FK
--                        (cross-domain). `last_error` is what the status job last failed on, for an operator.
--                        The counting ledger and the initial ranks come with slices 2 and 3.
-- group_season_sessions  the sessions an owner or admin linked to a MANUAL season. A table, not a column: the statistics engine looks
--                        seasons up by session id, and the owner adds and removes single rows. AUTO membership is derived by query
--                        (the session's local date in the season's timezone), never stored. season_id is in-domain and keeps its FK;
--                        session_id and linked_by are cross-domain or plain ids and carry none.
CREATE TABLE group_seasons (
    id BIGSERIAL PRIMARY KEY,
    group_id BIGINT NOT NULL,
    sport_id BIGINT NOT NULL,
    name VARCHAR(100) NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    timezone VARCHAR(64) NOT NULL,
    status VARCHAR(12) NOT NULL,
    collection_mode VARCHAR(8) NOT NULL,
    inherit_ranks BOOLEAN NOT NULL DEFAULT FALSE,
    stats_config JSONB NOT NULL,
    ranking_rule JSONB NOT NULL,
    post_id BIGINT NOT NULL,
    created_by UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    cancelled_by UUID,
    cancelled_at TIMESTAMPTZ,
    finalised_at TIMESTAMPTZ,
    last_error VARCHAR(500),
    CONSTRAINT chk_group_seasons_status CHECK (status IN ('SCHEDULED', 'ONGOING', 'COMPLETED', 'FINALISED', 'CANCELLED')),
    CONSTRAINT chk_group_seasons_mode CHECK (collection_mode IN ('AUTO', 'MANUAL')),
    CONSTRAINT chk_group_seasons_dates CHECK (end_date >= start_date AND end_date - start_date < 31),
    CONSTRAINT uq_group_seasons_post UNIQUE (post_id)
);

CREATE INDEX idx_group_seasons_group ON group_seasons (group_id, start_date);
-- the status job reads only the seasons that can still change
CREATE INDEX idx_group_seasons_open ON group_seasons (status) WHERE status IN ('SCHEDULED', 'ONGOING', 'COMPLETED');

CREATE TABLE group_season_sessions (
    season_id BIGINT NOT NULL REFERENCES group_seasons (id) ON DELETE CASCADE,
    session_id BIGINT NOT NULL,
    linked_by UUID NOT NULL,
    linked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (season_id, session_id)
);

CREATE INDEX idx_group_season_sessions_session ON group_season_sessions (session_id);

-- SESSION-55: the season's thread anchor is a post of its own type (V050 added SESSION_POST the same way)
ALTER TABLE posts DROP CONSTRAINT chk_post_type;
ALTER TABLE posts ADD CONSTRAINT chk_post_type CHECK (post_type IN ('USER_FEED', 'GROUP_POST', 'GROUP_BROADCAST', 'GROUP_SYSTEM', 'SESSION_POST', 'SEASON_POST'));
