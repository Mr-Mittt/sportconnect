# SESSION-30 · /discover's date/startTime filters: CAST now, generated+indexed columns only if real data justifies it

**Status:** `SUPERSEDED` (2026-09-15) — see "What actually happened" below. The premise this ticket
was weighing (CAST performance vs. generated-column performance) no longer applies: `CAST` on
`scheduledStart` turned out to be **actively wrong**, not just a performance question, and neither
filter uses it anymore.
**Type:** Concern / Future enhancement (Performance)
**Depends on:** SESSION-25 (introduces the filters this ticket is about)
**Filed:** 2026-09-15, during SESSION-25's design: the ticket's date/startTimeFilter params need to
match scheduledStart's date-only and time-only components independently. Considered splitting
scheduledStart into separate columns; user asked to establish the actual perf cost before deciding.

## What was measured

Benchmarked on the real dev Postgres (not a guess): seeded 1000 synthetic standalone sessions inside
a rolled-back transaction (no permanent change), concentrated on one sport_id, ~711 matching
`/discover`'s existing predicates (`groupId IS NULL`, `status IN (PREPARING,SCHEDULED,ONGOING)`,
`scheduledStart >= now()`). Compared `EXPLAIN ANALYZE` for `CAST(scheduled_start AS date/time)`
predicates against `GENERATED ALWAYS AS (...) STORED` columns (`scheduled_date`/`scheduled_time`)
with their own indexes:

| Filter | Plan | Execution time |
|---|---|---|
| `CAST(... AS date) = :date` | Seq Scan | 0.165 ms |
| `CAST(... AS time) >= :time` | Seq Scan | 0.189 ms |
| generated `scheduled_date` + index | Bitmap Index Scan | 0.096 ms |
| generated `scheduled_time` + index | Bitmap Index Scan | 0.134 ms |

At 1000 rows the planner still prefers a Seq Scan for the CAST version (cheaper than an index scan
at this table size) — generated+indexed columns are ~1.4-2x faster in relative terms, but the
absolute gap (0.03-0.07ms) is negligible next to normal request overhead. The existing
`idx_sessions_sport_id_standalone (sport_id, status, scheduled_start) WHERE group_id IS NULL`
already does the heavy narrowing before either version's date/time predicate runs, so the CAST's
cost is bounded by that already-small candidate set, not the whole table.

## Decision made

SESSION-25 ships with `CAST(scheduled_start AS date/time)` in `SessionRepository
.findDiscoverSessions`. No schema change — `scheduledStart` stays a single `LocalDateTime` column,
avoiding blast radius on its other 10+ consumers (`unique_group_session_start`,
`findSessionsToStart`, `findSessionsToComplete`, `findUpcomingSessions`/`findUpcomingSessionsByDate`,
`findHistorySessionsByDate`, `findHistoryDateCounts`, `SessionGenerationService`'s recurrence math,
`SessionResponse`/the client) — all of which are genuinely simpler as one combined datetime.

## Why not decided differently now

`/discover`'s date/time filters are brand new (SESSION-25) — there's no real query volume yet to
say whether the CAST cost ever becomes real. The benchmark above is illustrative, not representative
of production scale.

## Trigger to revisit

Once a single sport's `PREPARING`/`SCHEDULED`/`ONGOING` standalone session count (the slice
`idx_sessions_sport_id_standalone` narrows to) grows into the thousands-to-tens-of-thousands range,
re-run this same `EXPLAIN ANALYZE` comparison on real data before deciding whether to add
`scheduled_date`/`scheduled_time` as `GENERATED ALWAYS AS (...) STORED` columns with their own
indexes, referenced by `findDiscoverSessions` instead of `CAST`. This ticket is a documented decision
not to do it now, not a queued task to do it later on a timer — don't pick it up speculatively.

**Out of scope:** does not affect `scheduledStart`'s role as the source of truth for chronological
ordering/range logic elsewhere in the module — scoped purely to `/discover`'s two filter predicates.

## What actually happened (2026-09-15, superseding the above)

Building the IT test suite for SESSION-25 (`SessionDiscoverIntegrationTest`) found that `CAST(
scheduled_start AS date/time)` doesn't just have a *performance* cost — it silently returns the
**wrong value**. This app's `hibernate.jdbc.time_zone: UTC` setting shifts every stored
`LocalDateTime` by the JVM's zone offset on write, and that shift is only reapplied by Hibernate on
a plain attribute read — a SQL function applied directly to the column (`CAST`, `EXTRACT`) reads
the raw, un-reapplied value instead. Confirmed directly: `CAST(s.scheduledStart AS date)` on an
early-morning session returned the previous calendar day.

This makes the benchmark above moot — it measured the performance of a construct that turned out to
be a correctness bug, not a viable option to keep using at any speed. The actual fix:
- `date` now uses a half-open `[dayStart, dayEnd)` `LocalDateTime` range (no `CAST` at all) — the
  same pattern `findUpcomingSessionsByDate`/`findHistorySessionsByDate` already used.
- `startTime` now uses `EXTRACT` + a JVM-offset correction (`MOD` arithmetic), not `CAST(... AS
  time)` — a different, more involved fix, since "time-of-day regardless of date" can't be
  expressed as a single date range the way `date` could.

So there's no longer a live "CAST vs. generated column" question for either filter — full write-up
in `SessionRepository.findDiscoverSessions`' Javadoc. A related, **already-shipped** instance of the
same timezone bug was found in `findHistoryDateCounts` (SESSION-27) and filed separately as
**SESSION-31**.

---

🤖 Generated with [Claude Code](https://claude.com/claude-code)
