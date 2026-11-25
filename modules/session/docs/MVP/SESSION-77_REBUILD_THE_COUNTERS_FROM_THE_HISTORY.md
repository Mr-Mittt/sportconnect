# SESSION-77 · Rebuild the counters from the history

**Status:** `TODO`
**Type:** Enhancement · **Depends on:** SESSION-53
**Filed:** 2026-11-23, `/feature` session "statistic and ranking" (owner specification `modules/session/docs/GROUP_AND_REGION_STATISTIC_RANKING.md`; design `modules/session/docs/STATISTIC_RANKING_DESIGN.md`; BA hand-over `modules/session/docs/STATISTIC_RANKING_DELTA.md`). The statistics blobs and the ranking projection are incremental; the truth is `session_stats_jobs.result` (the counted records of each session, each with its `ranking` mark: `{recordId, ranking}`), `session_records` and the confirmations (the capped history pointers are not a source). When a rule changes (a sport's schema, a fixed bug) an admin needs to recompute them.

An ADMIN-only operation that recomputes the blobs and the projection rows of one sport (or one group) from the job results, the records and the confirmations, in batches, marking the boards dirty, safe to repeat, with a count of what changed. Job rows pruned by SESSION-75 are recomputed from `session_records` directly. Decide at pickup how it avoids racing the statistics tick (a per-sport lock row).

**Tests:** Spock and an integration test (a changed counter is repaired; the history is untouched).

## Hand-over from the SESSION-53 rework (2026-11-25, owner)

- **The rebuild covers what a rule change leaves behind.** A stat added to a sport's `record.scoreboard.columns`, or a `groupBy` added later, has **no history until this rebuild**, and a session the engine marked `SKIPPED` with the note `STATISTICS_NOT_CONFIGURED` (the sport had no columns then) is final in `session_stats_jobs`, so the rebuild must reprocess sessions from `session_records` and the confirmations, not from the job rows' `counted` lists alone.
- It rewrites `user_sport_stats`, `group_member_stats` **and `group_stats`** (the group head-to-head: rebuild in the order the sessions ended, so the running game number `seq` is right and the 5,000-matchup cap drops the right entries), and marks every board dirty (the engine writes no `leaderboard_entry`; SESSION-54's job rebuilds the boards from the blobs).
- Only for a sport with statistics switched on; the collected stats are whatever the sport's current columns (and ranking sort) need (`StatisticsSchema.of(schema).collected()`).

**Hand-over from SESSION-81 (2026-11-25):** the rebuild writes counters through `StatsCounters.encode` (one string by stat id, never a hand-built map), the history and the job result in their compact string formats (`StatsHistory.entry`), and **a group's rows by the group's member numbers** (`GroupMemberNumberService.getMemberNumbers`, which allocates a missing number), so a rebuilt row is byte for byte what the engine writes. The head-to-head document has no member dictionary any more.