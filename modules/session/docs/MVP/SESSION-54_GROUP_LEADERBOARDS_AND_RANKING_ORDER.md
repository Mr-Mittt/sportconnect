# SESSION-54 · Ranking jobs and the boards: group, region and country

**Status:** `TODO`
**Type:** Feature · **Depends on:** SESSION-73 · **Review gate 2 follows this ticket** (the ranking job and the cooldown).
**Filed:** 2026-11-12 as "Group leaderboards and the admin-set ranking order (BA LB-1 to LB-9)"; **rewritten 2026-11-23** by the `/feature` session "statistic and ranking" (`modules/session/docs/STATISTIC_RANKING_DESIGN.md`). The earlier text (admin-set order, group-only) is superseded: the order is the sport's, a group's own order is later.

Design section 7.

- **The projection and the ranking statement (owner, 2026-11-23):** ranks live in `leaderboard_entry (scope_type, scope_id, sport_id, kind, subject_key, k1, k2, k3, games, rank, ranked_at)`, one row per player or combo per board (GROUP, REGION, COUNTRY; SINGLE or COMBO), upserted by the statistics job (SESSION-53) with `k1..k3` from `record.ranking.sort` (a core counter, a metric or a derived formula; at most three keys, validated when the schema is saved). Ranking a board is one set-based statement: `UPDATE ... SET rank = r.rk, ranked_at = now() FROM (SELECT subject_key, rank() OVER (ORDER BY k1, k2, k3 with the sport's directions) rk ... WHERE <board> AND games >= :minGames) r ... WHERE e.rank IS DISTINCT FROM r.rk`, then `rank = NULL` below `minGames` (`single`, `combo`); equal entries share a rank; index `(scope_type, scope_id, sport_id, kind, k1 DESC, k2 DESC, k3 DESC)`. Measure it on a large synthetic country board at review gate 2 and decide then whether a Redis sorted set per board is needed (rebuilt from Postgres, `REDIS_KEYS.md` row).
- **Nightly job:** cron `app.stats.ranking.cron` (default `0 5 0 * * *`, `Asia/Ho_Chi_Minh`), walks the dirty boards one per transaction, bounded per pass; a board is claimed by compare-and-set on `stat_board_runs` (stale claim 15 minutes); the dirty flag is cleared only by the run that read it.
- **Manual refresh:** `POST /api/sessions/group/{groupId}/leaderboard/refresh?sportId=`, group owner or admin; one atomic update claims the board only when `computed_at <= now - 1 hour` (configurable); otherwise 429 `STATS_RANKING_COOLDOWN` with `retryAfterSeconds`; region and country boards are never refreshed by hand.
- **Reads:** the group board (members only) gains ranks; `GET /api/leaderboards/regions/{regionId}` and `/countries/{countryId}` (`sportId`, `kind` SINGLE or COMBO, paged) for every signed-in user, by display name, with the caller's own row; every answer carries `rankedAt`. Deactivated users and members who left are dropped at read time.
- **Account lifecycle:** the job counts nothing new; reads drop deactivated users; the refresh is behind the active gate and the owner/admin check.
- **Redis/ports:** none. The cron expression and cooldown are properties; add them to the production deployment guide's configuration list in the same change.

**Out of scope:** a group's own ranking order (later), seasons (SESSION-55), adjustments (SESSION-56), head-to-head.

**Tests:** Spock for the ranking maths (sort keys, ties, minimum games) and the cooldown; `server/src/test/.../integration` for the refresh permissions, the 429, the board visibility (member vs non-member, any signed-in user for region and country), dropped users; real-Postgres concurrency (nightly vs manual refresh on one board, two refreshes at once) or listed as not run; mutation check per rule.
