-- SESSION-54 (design: modules/session/docs/SESSION-54_LEADERBOARD_STORAGE_DESIGN.md, locked by the owner 2026-11-26).
-- V104 and V105 are merged and stay as they are; this file changes what they made.
--
-- leaderboard_entry     was the flat ranking projection of V104 (one row per ranked subject, sort values k1..k3). Nothing has
--                       written it since the SESSION-53 rework, so it is dropped and made again as ONE ROW PER BOARD: the
--                       board is a tree keyed by the sport's sort values (the rank is derived from it), see BoardTree.
-- stat_board_changes    append-only: the statistics engine inserts one row per player and board when it counts a game (in the
--                       same transaction); the nightly job takes the highest id of a board as its cutoff, rebuilds those
--                       players' entries and deletes the rows up to the cutoff, so a game counted during a run is kept for
--                       the next one.
-- sport_ranking_rules   the server-only sort list of a board, one row per sport, scope (SPORT default, COUNTRY: every region
--                       board and the country board of that country, GROUP: one group's own) and kind (SINGLE, PARTNER).
-- stat_board_runs       gets the country of a region board (so the job works a country at a time), the rules version the board
--                       was built with, a full-rebuild flag, the last error and when a failed board is tried again.

DROP TABLE leaderboard_entry;

CREATE TABLE leaderboard_entry (
    sport_id BIGINT NOT NULL,
    scope_type VARCHAR(10) NOT NULL,
    scope_id BIGINT NOT NULL,
    kind VARCHAR(10) NOT NULL,
    tree JSONB NOT NULL,
    entries INTEGER NOT NULL DEFAULT 0,
    rules_version INTEGER NOT NULL DEFAULT 0,
    computed_at TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (sport_id, scope_type, scope_id, kind)
);

CREATE TABLE stat_board_changes (
    id BIGSERIAL PRIMARY KEY,
    sport_id BIGINT NOT NULL,
    scope_type VARCHAR(10) NOT NULL,
    scope_id BIGINT NOT NULL,
    user_id UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_stat_board_changes_board ON stat_board_changes (sport_id, scope_type, scope_id, id);

CREATE TABLE sport_ranking_rules (
    sport_id BIGINT NOT NULL,
    scope_type VARCHAR(10) NOT NULL,
    scope_id BIGINT NOT NULL,
    kind VARCHAR(10) NOT NULL,
    sort JSONB NOT NULL,
    conditions JSONB NOT NULL DEFAULT '[]'::jsonb,
    version INTEGER NOT NULL DEFAULT 1,
    updated_by UUID,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (sport_id, scope_type, scope_id, kind)
);

ALTER TABLE stat_board_runs ADD COLUMN country_id BIGINT;
ALTER TABLE stat_board_runs ADD COLUMN rules_version INTEGER NOT NULL DEFAULT 0;
ALTER TABLE stat_board_runs ADD COLUMN full_rebuild BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE stat_board_runs ADD COLUMN last_error VARCHAR(500);
ALTER TABLE stat_board_runs ADD COLUMN next_attempt_at TIMESTAMPTZ;

-- The job's "which boards have work" query reads only the dirty ones.
CREATE INDEX idx_stat_board_runs_dirty ON stat_board_runs (sport_id, country_id) WHERE dirty;
