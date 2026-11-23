# SESSION-75 · Prune the finished rows of `session_stats_jobs` after about 30 days

**Status:** `TODO`
**Type:** Enhancement (retention) · **Depends on:** SESSION-53
**Filed:** 2026-11-23, `/feature` session "statistic and ranking" (owner specification `modules/session/docs/GROUP_AND_REGION_STATISTIC_RANKING.md`; design `modules/session/docs/STATISTIC_RANKING_DESIGN.md`; BA hand-over `modules/session/docs/STATISTIC_RANKING_DELTA.md`). The queue keeps DONE and SKIPPED rows for ever otherwise (a table nothing deletes from needs a retention rule). History, verifications and counters are never pruned.

A bounded daily delete of DONE and SKIPPED job rows older than 30 days (configurable), batched, never touching RETRY, RUNNING or FAILED. Same shape as SESSION-GROUP-8.

**Tests:** Spock plus an integration test (old DONE removed, old FAILED kept, recent DONE kept).
