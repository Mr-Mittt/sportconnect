-- SESSION-53: the statistics engine (design: modules/session/docs/STATISTIC_RANKING_DESIGN.md, sections 4 and 6).
-- Five session-owned tables. No foreign keys to other domains (user, sport, group and region ids only); the sessions
-- table is the same domain but the job row is keyed by the session id with no FK, like session_records.
--
-- session_stats_jobs      the queue: one row per completed session once its 24-hour guard has passed, and the
--                         permanent record of what that session contributed (result). Statuses: RUNNING (claimed),
--                         DONE (at least one game counted), SKIPPED (nothing countable), RETRY (an attempt failed,
--                         next_attempt_at is when it is due), FAILED (attempts used up).
-- user_sport_stats        one blob row per user and sport: personal counters (all games and ranking games), the
--                         groupings (per partner, per team), the region and country scopes earned by ranking games,
--                         the history pointers. Every jsonb shape: documentation/md/STATISTICS_JSONB_REFERENCE.md.
-- group_member_stats      the same for the games of one group's sessions, per member.
-- leaderboard_entry       the flat ranking projection: one row per player or pair per board, with the sport's three
--                         sort values computed once when the row is written. Ranked by the nightly job (SESSION-54).
-- stat_board_runs         one tiny row per board: dirty flag, claim and time, for the ranking job (SESSION-54).

CREATE TABLE session_stats_jobs (
    session_id BIGINT PRIMARY KEY,
    status VARCHAR(10) NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    next_attempt_at TIMESTAMPTZ,
    claimed_at TIMESTAMPTZ,
    last_error VARCHAR(500),
    counted INTEGER NOT NULL DEFAULT 0,
    ignored INTEGER NOT NULL DEFAULT 0,
    result JSONB,
    finished_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- The tick's "what is due" query reads rows that are not final.
CREATE INDEX idx_session_stats_jobs_due ON session_stats_jobs (status, next_attempt_at)
    WHERE status IN ('RETRY', 'FAILED', 'RUNNING');

CREATE TABLE user_sport_stats (
    user_id UUID NOT NULL,
    sport_id BIGINT NOT NULL,
    personal JSONB NOT NULL DEFAULT '{}'::jsonb,
    groupings JSONB NOT NULL DEFAULT '{}'::jsonb,
    scopes JSONB NOT NULL DEFAULT '[]'::jsonb,
    history JSONB NOT NULL DEFAULT '[]'::jsonb,
    version INTEGER NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, sport_id)
);

CREATE TABLE group_member_stats (
    group_id BIGINT NOT NULL,
    user_id UUID NOT NULL,
    sport_id BIGINT NOT NULL,
    stats JSONB NOT NULL DEFAULT '{}'::jsonb,
    history JSONB NOT NULL DEFAULT '[]'::jsonb,
    version INTEGER NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (group_id, user_id, sport_id)
);

CREATE TABLE leaderboard_entry (
    scope_type VARCHAR(10) NOT NULL,
    scope_id BIGINT NOT NULL,
    sport_id BIGINT NOT NULL,
    kind VARCHAR(10) NOT NULL,
    subject_key VARCHAR(255) NOT NULL,
    k1 DOUBLE PRECISION,
    k2 DOUBLE PRECISION,
    k3 DOUBLE PRECISION,
    games INTEGER NOT NULL DEFAULT 0,
    rank INTEGER,
    ranked_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (scope_type, scope_id, sport_id, kind, subject_key)
);

-- The ranking statement (SESSION-54) reads one board in sort order.
CREATE INDEX idx_leaderboard_entry_board ON leaderboard_entry
    (scope_type, scope_id, sport_id, kind, k1 DESC NULLS LAST, k2 DESC NULLS LAST, k3 DESC NULLS LAST);

CREATE TABLE stat_board_runs (
    sport_id BIGINT NOT NULL,
    scope_type VARCHAR(10) NOT NULL,
    scope_id BIGINT NOT NULL,
    dirty BOOLEAN NOT NULL DEFAULT FALSE,
    dirty_at TIMESTAMPTZ,
    status VARCHAR(10) NOT NULL DEFAULT 'IDLE',
    claimed_at TIMESTAMPTZ,
    computed_at TIMESTAMPTZ,
    PRIMARY KEY (sport_id, scope_type, scope_id)
);
