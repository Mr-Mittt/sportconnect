# SESSION-53 · Result statistics: per player, head-to-head, pair stats, scope (BA ST-1 to ST-7)

**Status:** `TODO`
**Type:** Feature · **Depends on:** SESSION-50 ·
**Filed:** 2026-11-12, Filed 2026-11-12 by the `/feature` session "game logging" (BA document `D:\Planning\business-analyst\Requirements - Games, Statistics and Leaderboards.md`; design: `modules/session/docs/SESSION_RECORDS_DESIGN.md`).

Server-side statistics calculated from the stored records, never kept as editable totals (ST-5), reading the fields the sport's result schema names and skipping a malformed record. Per player: games, wins, losses, win rate, net points; head-to-head for two players as opponents and as partners; pair stats; scope all-time, a season or one session; most frequent and best partners and the opponent a player loses to most (Should). Target: head-to-head under 2 seconds on a phone connection, so measure with real data and add the GIN index on `session_records.player_ids` here if the query needs it (or a rebuildable projection table). Standalone games count toward a player's career statistics and head-to-head, never toward a group board. Visibility: group members only for group statistics, session participants only for standalone ones (NF-6).

**Out of scope:** Boards and ranking (SESSION-54), seasons (SESSION-55), adjustments (SESSION-56).

**Tests:** Spock for the maths against the worked example month in the BA acceptance criteria; an IT through the real endpoint for the visibility rules; a query-plan check for the speed target.
