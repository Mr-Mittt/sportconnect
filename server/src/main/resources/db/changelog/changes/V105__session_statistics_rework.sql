-- SESSION-53 rework (owner, 2026-11-25): two additions on top of V104, which is already merged and is left exactly as it was.
--
-- group_stats                 what a group keeps about itself in a sport: the head-to-head of its pairs, one jsonb document
--                             per group and sport (member dictionary, matchups, the latest 5,000 kept), written by the
--                             statistics engine in the session's counting transaction. Session-owned, no foreign keys
--                             (the group id is the group module's).
-- sports.statistics_enabled   the sport's switch for statistics and ranking, together. Off by default, so after the deploy
--                             the engine counts nothing until an admin switches a sport on: the statistics runner picks
--                             only the sessions of sports that have it on, and the ranking proposal refuses the others.
--                             Results logging does not depend on it (it needs only sports.result_schema).
--
-- The engine no longer writes leaderboard_entry (V104 made the table; SESSION-54's job will fill and rank it); it only
-- marks boards dirty in stat_board_runs. The counters stored in user_sport_stats and group_member_stats are now flat and
-- hold only the stats the sport's record.scoreboard.columns list; a database that counted sessions with the first build
-- (development only: it was never released) holds the old shape and should clear those tables, see the release notes.

CREATE TABLE group_stats (
    group_id BIGINT NOT NULL,
    sport_id BIGINT NOT NULL,
    h2h JSONB NOT NULL DEFAULT '{}'::jsonb,
    version INTEGER NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (group_id, sport_id)
);

ALTER TABLE sports ADD COLUMN statistics_enabled BOOLEAN NOT NULL DEFAULT FALSE;
