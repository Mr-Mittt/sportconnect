# SESSION-77 · Rebuild the counters from the history

**Status:** `TODO`
**Type:** Enhancement · **Depends on:** SESSION-53
**Filed:** 2026-11-23, `/feature` session "statistic and ranking" (owner specification `modules/session/docs/GROUP_AND_REGION_STATISTIC_RANKING.md`; design `modules/session/docs/STATISTIC_RANKING_DESIGN.md`; BA hand-over `modules/session/docs/STATISTIC_RANKING_DELTA.md`). The statistics blobs and the ranking projection are incremental; the truth is `session_stats_jobs.result` (the counted record ids of each session), `session_records` and the confirmations (the capped history pointers are not a source). When a rule changes (a sport's schema, a fixed bug) an admin needs to recompute them.

An ADMIN-only operation that recomputes the blobs and the projection rows of one sport (or one group) from the job results, the records and the confirmations, in batches, marking the boards dirty, safe to repeat, with a count of what changed. Job rows pruned by SESSION-75 are recomputed from `session_records` directly. Decide at pickup how it avoids racing the statistics tick (a per-sport lock row).

**Tests:** Spock and an integration test (a changed counter is repaired; the history is untouched).
