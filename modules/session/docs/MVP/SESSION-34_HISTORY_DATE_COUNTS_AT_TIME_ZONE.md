# SESSION-34 · Rewrite `findHistoryDateCounts` using `AT TIME ZONE`, retire `zoneOffsetSeconds`

**Status:** `TODO`
**Type:** Bug Fix (root-cause) / Refactor
**Depends on:** SESSION-33 (needs `scheduled_start` as `TIMESTAMPTZ`), LOC-4 (needs
`Location.timezone` for the join)
**Filed:** 2026-09-16 — **supersedes SESSION-31**
(`modules/session/docs/MVP/SESSION-31_HISTORY_DATE_COUNTS_TIMEZONE_BUG.md`), which implemented and
fully verified (H2 + real Postgres, `:server:test` green) a JVM-offset-correction point-fix for this
same query, then had that fix **deliberately reverted before merge** once this root-cause redesign
was chosen instead in a follow-up discussion. SESSION-31's file still has the original bug diagnosis
(mechanism, exact failure window, regression-test shape) — all of it stays accurate; only the fix
approach changed. Full design in `documentation/md/LOCATION_TIMEZONE_DESIGN.md`.

`SessionRepository.findHistoryDateCounts` (backs `GET /api/sessions/history?dateCount`) currently
misbuckets early-morning sessions onto the wrong calendar day, because it `CAST`s `scheduled_start`
directly without reversing Hibernate's write-side shift. Once SESSION-33 lands, `scheduled_start` is
a real instant with no such shift to reverse — this ticket replaces the reverted
`CAST(...)`/`zoneOffsetSeconds` approach entirely with an explicit, per-row `AT TIME ZONE`
conversion using the session's own canonical zone.

## Scope

- `findHistoryDateCounts`: bucket by
  `CAST(s.scheduled_start AT TIME ZONE COALESCE(l.timezone, s.origin_zone_id) AS date)` — exact
  join shape (a `LEFT JOIN locations l ON l.id = s.location_id`, since `location_id` is nullable for
  `PREPARING`/standalone sessions) and `COALESCE` precedence TBD at pickup, and blocked on
  SESSION-33's own open precedence question (what happens once a `PREPARING` session's location is
  attached after creation) being resolved first.
- Re-review every other `scheduledStart`/`scheduled_start`-touching query in `SessionRepository` for
  the same treatment where relevant: `findUpcomingSessions(ByDate)`, `findHistorySessionsByDate`,
  `findSessionsToStart`/`ToComplete`, `findUnpreparedSessionsToCancel`. Most of these compare against
  a caller-supplied bound rather than bucketing/extracting a calendar date, so a plain instant
  comparison may already be correct without any `AT TIME ZONE` — confirm which do and don't need
  changing at pickup rather than blanket-converting every query that happens to touch the column.
- Regression tests: reuse the early-morning fixture shape from SESSION-31's reverted attempt
  (`SessionListingIntegrationTest`'s `history_dateCountBucketsAnEarlyMorningSessionOnItsOwnCalendarDay`
  pattern) and re-verify against real Postgres as well as H2 — this exact bug class previously
  diverged between the two engines (SESSION-31's own `INTERVAL`/`GROUP BY`-alias syntax fights are
  documented there for reference, though they won't recur here since `AT TIME ZONE` replaces the
  interval arithmetic entirely).

## Out of scope

`/discover`'s `date`/`startTime` filters — a different canonical zone (caller's, not the session's)
for a different purpose. That's SESSION-35.

---

🤖 Generated with [Claude Code](https://claude.com/claude-code)
