# SESSION-73 · Statistics read API: personal, history and group member statistics

**Status:** `TODO`
**Type:** Feature · **Depends on:** SESSION-53 (and review gate 1)
**Filed:** 2026-11-23, `/feature` session "statistic and ranking" (owner specification `modules/session/docs/GROUP_AND_REGION_STATISTIC_RANKING.md`; design `modules/session/docs/STATISTIC_RANKING_DESIGN.md`; BA hand-over `modules/session/docs/STATISTIC_RANKING_DELTA.md`).

Reads over the counters and the history. Design section 7 (reads) and 8.

- `GET /api/stats/me?sportId=` the caller's `user_sport_stats` row (personal counters for all games and ranking games, normal derived as the difference, the per-partner and per-team groupings, the scope entries) in one read, the sport's derived columns evaluated from its schema, and `asOf` (the last counted session).
- `GET /api/stats/me/games?sportId=&cursor=` a page of the caller's history: the blob's pointers (newest first, at most 500) sliced by cursor, each resolved by id from `session_records` and the session (teams, scores, ranking badge, date); one batch query per page, never one per game.
- `GET /api/sessions/group/{groupId}/stats?sportId=` the group's member statistics from `group_member_stats` (singles, and the per-partner and per-team groupings, unranked here; ranks come with SESSION-54); members only (404 before 403); a user who left the group or is deactivated is not listed.
- All the sport's columns come from its schema; names through the display lookups (a deactivated player's name still shows in history).
- **Account lifecycle:** behind the per-request active gate; deactivated users are filtered at read time with `getActiveUserIds` (a new interaction), never in the history.
- Measure the read against real data (target under 2 seconds on a phone connection, BA ST-7) and say which index it uses.

**Out of scope:** another player's personal statistics (SESSION-74), head-to-head (SESSION-76), ranks (SESSION-54).

**Tests:** Spock and an integration test for the visibility (own stats only, member vs non-member, left member), paging, the derived normal numbers.

**What SESSION-53 built that this ticket reads (2026-11-23, hand-over):** `user_sport_stats` and `group_member_stats` are read through `PlayerStatsDoc.read(row)` and `GroupStatsDoc.read(row)` (public, in `com.sportconnect.session.stats`): `personal().all()` and `.ranked()` are `StatsCounters` (`core("games")`, `metric("scoreFor")`, ...), `group("PARTNER", partnerUserId)` the counters with one teammate and `group("TEAM", comboKey)` the pair counters (key = the sorted member ids joined by commas; `AllRanked` for a player, `StatsCounters` in a scope or a group member), `scope(...)` the venue region and country entries (each with its own `group(by, key)`). **The jsonb shapes are documented in `documentation/md/STATISTICS_JSONB_REFERENCE.md` (read it before writing the response DTOs; the client will build on it), and the sport's `record.statistics.counters` says which core counters to show (default `games`, `wins`).** The sport's derived columns come from `StatisticsSchema.of(schema).valueOf(key, counters)` (null when there is no value, for example a division by zero); never recompute them in a new place. "Normal games" are all minus ranking for the core counters and SUM metrics only: a MAX or MIN metric is shown for all games and for ranking games, not as a difference. The history pointer is `{recordId, sessionId, ranking}`, newest first, at most 500; `asOf` is the `finished_at` of the latest `DONE` row of `session_stats_jobs`. A history page resolves its games by id from `session_records` and the sessions in one query each.
