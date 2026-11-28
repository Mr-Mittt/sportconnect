-- SESSION-55 slice 2: what a season counts. Same shapes as a group's (SESSION-53): season_member_stats mirrors group_member_stats (one row per member,
-- `stats` counters and groupings, `history` pointers, partners named by the group's permanent member numbers), season_stats mirrors group_stats
-- (the head-to-head). Both are in-domain children of group_seasons (FK, deleted with it). group_seasons.counted_sessions is the ledger:
-- {"<sessionId>": {"g": [recordIds counted], "p": [userIds given a `sessions` count]}}, written whole by the counter under the season's row lock;
-- a session in it is never added twice, and removing a linked session subtracts exactly its entry.
ALTER TABLE group_seasons ADD COLUMN counted_sessions JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE season_member_stats (
    season_id BIGINT NOT NULL REFERENCES group_seasons (id) ON DELETE CASCADE,
    user_id UUID NOT NULL,
    stats JSONB NOT NULL DEFAULT '{}'::jsonb,
    history JSONB NOT NULL DEFAULT '[]'::jsonb,
    version INTEGER NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (season_id, user_id)
);

CREATE TABLE season_stats (
    season_id BIGINT PRIMARY KEY REFERENCES group_seasons (id) ON DELETE CASCADE,
    h2h JSONB NOT NULL DEFAULT '{}'::jsonb,
    version INTEGER NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
