# SESSION-82 · A `sessions` stat (sessions played) and stats that apply to singles only

**Status:** `TODO`
**Type:** Enhancement · **Depends on:** SESSION-81 (the string counters and global stat ids), SESSION-54 (the boards read the catalog); **better after** SESSION-77 (the rebuild), see below
**Filed:** 2026-11-26, owner question during SESSION-54 slice B: a group wants a custom member column "joined sessions", the number of sessions a member played at least one counted game in, and it must not appear for pairs. Duplicate check: no session or client ticket names a sessions-count stat (searched both backlogs, the drafts file and the ticket folders); SESSION-55 (seasons) and SESSION-77 (rebuild) are neighbours, not duplicates.

A new catalog stat `sessions` (the next global id after the current eight, append-only; **never reorder or reuse an id**, SESSION-81) that counts **sessions, not games**: after a session's games are counted, each player who had **at least one counted game** in it gets +1, in every scope where that player has a counted game of that session (their own totals, the group member row, and the region and country entries only through ranking games). A sport collects it by listing it in `record.scoreboard.columns`; ranking rules and `require` can then use it like any stat (for example a group's rule `sessions >= 3`), and the statistics screens show it.

**Single-only.** The catalog gains an "applies to" attribute per stat: `sessions` applies to a single player's counters only. The engine's calls for partner and team entries pass `stats.collected()` without the single-only stats, so a pair entry never holds a `sessions` slot (an empty slot in the counters string, like `scoreFor` for a sport that does not collect it). `RankingRuleServiceImpl.store` refuses a single-only stat in a `PARTNER` rule (`SESSION_RANKING_SORT_INVALID` / `SESSION_RANKING_REQUIRE_INVALID`, new reason `STAT_NOT_FOR_KIND`, `detail` the stat); a pair row shows no value for it.

**Decisions to confirm at pickup:** (1) the per-session step must not double count when a session is reprocessed (the engine's job row and `ClaimLostException` already make a session counted once; verify); (2) **no history before the rebuild**: counters already stored have no `sessions`, so it counts only sessions processed after the change until SESSION-77 exists; say so in the release note; (3) how it fits SESSION-55 (seasons): season counters will be built from `session_stats_jobs.result`, which lists counted records, so `sessions` per season is derivable if the job rows are not pruned first (SESSION-75).

**Client:** the catalog is mirrored in the client's `record-ui-v1.json` (`statIds`) and `StatsCatalogSpec` fails when they differ, so the client change is CLIENT-SESSION-61 and ships with this ticket.

**Out of scope:** seasons, a sessions count for pairs ("sessions together"), any record-level condition on which games count.

**Tests:** Spock for `StatsCounters` (the new slot, the single-only filter) and `StatsCatalogSpec`; `SessionStatsIntegrationTest` (a session with two games counts +1, a session with none counts 0, a pair entry has no slot, a reprocessed session counts once); `LeaderboardRankingIntegrationTest` (a SINGLE rule sorts and requires on it, a PARTNER rule refuses it); mutation-check each.
