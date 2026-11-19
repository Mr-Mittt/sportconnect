# SESSION-GROUP-8 · Prune the finished rows of the generation queue

**Status:** `TODO`
**Type:** Enhancement · **Depends on:** SESSION-GROUP-5
**Filed:** 2026-11-19, from the review of SESSION-GROUP-5's generation queue: a `DONE` or `IGNORED` row is never deleted (only the cascade of a deleted recurrence removes one), so the table grows by one row per generated or skipped slot, for ever.

`group_session_generation_queue` keeps one row per (recurrence, local date). Once a row is `DONE` (a session exists) or `IGNORED` (skipped, with a reason) nothing needs it again: the duplicate guard is the unique index on `sessions (recurrence_id, occurrence_date)`, and the planner does not queue a slot that has ended. The rows are useful for a while to investigate a missing session (`attempts`, `last_error`, `ignored_reason`, `last_attempt_at`). Delete the `DONE` and `IGNORED` rows older than a retention period (about 30 days, a property), from a scheduled job; never `PENDING` or `FAILED` rows (those are still work or a problem to look at). Weekly regular sessions give about 52 rows a year per recurrence, so this is housekeeping, not urgent.

The job runs on every instance, so the delete must be harmless to repeat (a plain `DELETE ... WHERE status IN (...) AND updated_at < :cutoff` is).

**Out of scope:** Pruning `sessions` themselves (SESSION-29); `FAILED` rows.

**Tests:** An IT: old `DONE` and `IGNORED` rows go, recent ones and every `PENDING` or `FAILED` row stay.
