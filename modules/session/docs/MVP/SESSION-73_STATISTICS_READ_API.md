# SESSION-73 · Statistics read API: personal, history and group member statistics

**Status:** `TODO`
**Type:** Feature · **Depends on:** SESSION-53 (and review gate 1)
**Filed:** 2026-11-23, `/feature` session "statistic and ranking" (owner specification `modules/session/docs/GROUP_AND_REGION_STATISTIC_RANKING.md`; design `modules/session/docs/STATISTIC_RANKING_DESIGN.md`; BA hand-over `modules/session/docs/STATISTIC_RANKING_DELTA.md`).

Reads over the counters and the history. Design section 7 (reads) and 8.

- `GET /api/stats/me?sportId=` the caller's `user_sport_stats` row (personal counters for all games and ranking games, normal derived as the difference, the combos, the scope entries) in one read, the sport's derived columns evaluated from its schema, and `asOf` (the last counted session).
- `GET /api/stats/me/games?sportId=&cursor=` a page of the caller's history: the blob's pointers (newest first, at most 500) sliced by cursor, each resolved by id from `session_records` and the session (teams, scores, ranking badge, date); one batch query per page, never one per game.
- `GET /api/sessions/group/{groupId}/stats?sportId=` the group's member statistics from `group_member_stats` (singles and combos, unranked here; ranks come with SESSION-54); members only (404 before 403); a user who left the group or is deactivated is not listed.
- All the sport's columns come from its schema; names through the display lookups (a deactivated player's name still shows in history).
- **Account lifecycle:** behind the per-request active gate; deactivated users are filtered at read time with `getActiveUserIds` (a new interaction), never in the history.
- Measure the read against real data (target under 2 seconds on a phone connection, BA ST-7) and say which index it uses.

**Out of scope:** another player's personal statistics (SESSION-74), head-to-head (SESSION-76), ranks (SESSION-54).

**Tests:** Spock and an integration test for the visibility (own stats only, member vs non-member, left member), paging, the derived normal numbers.
