# SESSION-34 · Rewrite `findHistoryDateCounts` using `AT TIME ZONE`, retire `zoneOffsetSeconds`

**Status:** `DONE` (2026-09-17)
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

## Scope change (2026-09-17, mid-implementation — supersedes "Scope"/"Resolved" above)

The location/origin-zone design above was implemented, fully tested, and verified against real
Postgres — then reconsidered and replaced before this ticket closed, based on a real objection: a
**personal** history view (this endpoint is always scoped to the caller's own `JOINED` sessions —
never a shared, multi-viewer view) reads oddest when a date is pinned to somewhere the viewer no
longer is. Concretely: a session played at 7am in a `UTC+7` location, viewed later by that same
person after they've flown to `UTC+1`, would (correctly, per the original design) still bucket as
"the 14th" — but taken further, a session whose location is far enough ahead of the viewer's current
zone can bucket onto a date that is, from the viewer's own current moment, still tomorrow: a
completed session appearing to have a future date in a feature literally called *history*.

**New design:** `/history?dateCount` now buckets by the caller's own **current** zone
(`viewerZoneId`, a new optional query param), not the session's location/origin zone. This also
made `Session.originZoneId` — introduced by SESSION-33 specifically as this ticket's fallback
source — pointless (it had exactly one consumer, this query, and gained none since); removed
entirely rather than left as dead code (new migration `V070`; see SESSION-33's own Delta note).
`location.timezone` is no longer read by this query either — no `LEFT JOIN locations`, resolving
the cross-domain native-SQL join this file's earlier design had deliberately (and, on reflection,
questionably) accepted as an exception.

- `findHistoryDateCounts` now takes a single `zoneId` param (never null — the service layer resolves
  it to `viewerZoneId` when given, else a fixed `"UTC"` default) and buckets every row by
  `AT TIME ZONE :zoneId` — one shared zone per call, not resolved per row, so there's no
  per-row-unresolvable case to handle and no join needed.
- `viewerZoneId` (optional, only valid alongside `dateCount`) is validated via `ZoneId.of(...)` →
  400 on an invalid value. Optional, not required, purely because no current client sends it yet
  (`CLIENT-SESSION-24` hasn't shipped) — requiring it would break `/history?dateCount` outright for
  every existing caller.
- The "exclude + log unresolved sessions" mechanism from the original design (see "Resolved" above)
  became unreachable dead code once `zoneId` can never be null (worst case, the `"UTC"` literal) —
  removed entirely: `findHistorySessionIdsWithUnresolvedZone`, its `WARN` logging, and the
  `COALESCE(...) IS NOT NULL` exclusion filter.
- **Follow-up filed:** `CLIENT-SESSION-24`'s scope extended to also attach the browser's IANA zone
  (`Intl.DateTimeFormat().resolvedOptions().timeZone`) to `/history?dateCount` requests, alongside
  its existing create/update and `/discover` scope.
- **SESSION-35 updated:** its own caller-zone sourcing question now has a concrete precedent to
  follow (or deliberately diverge from) — see that ticket's own updated "Open questions".

## What was built

Reflects the **final** design after the scope change above — see that section for what superseded
the original plan and why. No open deviations beyond the scope change itself.

- **`SessionRepository.findHistoryDateCounts`** — single `zoneId` param, buckets every row via
  `CAST(TO_CHAR(s.scheduled_start AT TIME ZONE :zoneId, 'YYYY-MM-DD') AS date)`. No join, no
  `COALESCE`, no exclusion — `zoneId` is guaranteed non-null by the caller.
- **`SessionServiceImpl.getSessionHistoryDates`** — new `viewerZoneId` param (`String`, nullable),
  validated via `ZoneId.of(...)` (`BadRequestException` on failure), resolved to
  `DEFAULT_HISTORY_ZONE_ID = "UTC"` when omitted, passed through as `zoneId`.
- **`SessionController`**/**`SessionService`** (`-api`) — new optional `viewerZoneId` query param on
  `GET /history`, rejected with 400 if given without `dateCount` (same pattern as `before`).
- **Removed:** `Session.originZoneId`, `CreateSessionRequest.originZoneId`, the capture logic in
  `createSession`, `SessionRepository.findHistorySessionIdsWithUnresolvedZone`, and the `origin_zone_id`
  column (`V070` migration — can't edit `V069`, already merged). Consumer census before removing:
  zero remaining readers anywhere in the codebase (grepped before touching anything), zero client
  consumers (no client ever sent it).
- Re-reviewed the other 5 `scheduled_start`-touching queries the ticket originally asked about
  (`findUpcomingSessions(ByDate)`, `findHistorySessionsByDate`, `findSessionsToStart`/`ToComplete`,
  `findUnpreparedSessionsToCancel`): none need `AT TIME ZONE` — all compare against a caller-supplied
  `Instant` range/cutoff rather than bucketing/extracting a calendar date. Still accurate after the
  scope change; unaffected either way. No changes made to them.
- Updated the stale cross-reference in `findDiscoverSessions`'s Javadoc that still flagged
  `findHistoryDateCounts` as an unfixed pre-existing bug.

**Real H2-vs-Postgres divergence found and fixed (not guessed — confirmed via a standalone H2
script and a real-Postgres temp-table reproduction of an earlier, per-row-zone shape of this exact
query, before the scope change to a single caller-resolved zone):** H2 2.2.224's
`CAST(timestamptz AT TIME ZONE zone AS date)` silently re-normalizes the value through the JDBC
session's own default zone instead of preserving the `AT TIME ZONE`-shifted wall-clock fields the
way real Postgres does — `AT TIME ZONE` itself computes the correct shifted value in H2, only the
subsequent narrowing cast discards it, and it doesn't throw, so this would have been an easy silent
H2-vs-production divergence to ship undetected. Fixed by routing through `CAST(TO_CHAR(x AT TIME
ZONE zone, 'YYYY-MM-DD') AS date)` instead of a direct `CAST`, verified to produce identical,
correct results on both engines. This fix carried forward unchanged through the scope change — the
H2 quirk is about `AT TIME ZONE` + narrowing casts generally, independent of which zone value is
used. Documented in `session-impl/CLAUDE.md`'s gotchas and SESSION-35's ticket file.

**A second, narrower H2 quirk found through Hibernate specifically** (not reproducible via a
hand-written JDBC `PreparedStatement` sending byte-identical SQL — root cause not fully isolated):
`GROUP BY` on the repeated `CAST(TO_CHAR(... AT TIME ZONE :zoneId, ...) AS date)` expression failed
with `Column "s.scheduled_start" must be in the GROUP BY list`, despite it matching the `SELECT`
list expression exactly. Fixed with `GROUP BY 1` (ordinal position) instead of repeating the
expression — sidesteps expression-equivalence checking entirely, verified correct on both H2 and
real Postgres (both support ordinal `GROUP BY`). Documented in `session-impl/CLAUDE.md`'s gotchas
as a second, distinct bullet from the `TO_CHAR` one above.

**Tests:**
- `SessionServiceImplSpec.groovy` — 3 pre-existing `getSessionHistoryDates` tests updated for the
  new `viewerZoneId` param and the `zoneId`/`limit` positional shift in `findHistoryDateCounts`'s
  mock args (the unresolved-zone stubs from the superseded design removed). 3 new tests: defaults
  to `"UTC"` when `viewerZoneId` omitted, passes a valid `viewerZoneId` through unchanged, rejects
  an invalid one with `BadRequestException`.
- `SessionListingIntegrationTest.java` — reverted the `LocationRepository`/`createLocation`/
  `defaultLocationId` scaffolding added for the superseded per-row-zone design (no longer needed —
  no join). Replaced the 4 old zone tests with: buckets by UTC when `viewerZoneId` omitted (a
  near-midnight-UTC instant, so a server-zone-based bug would misbucket it), the same session
  buckets differently depending on whether `viewerZoneId` is given, an invalid `viewerZoneId` → 400,
  and `viewerZoneId` without `dateCount` → 400 (mirrors the existing `before`-without-`dateCount`
  test).
- `:modules:session:session-impl:test` — 165 tests, 164 pass; the 1 failure
  (`SessionGenerationServiceSpec`'s `computeNextOccurrence uses today when today is the target
  weekday and the time hasn't passed`) is an unrelated, pre-existing flake — it uses
  `LocalTime.now().plusHours(2)`, which wraps past midnight when run within ~2 hours of it, breaking
  its own "hasn't passed today" assumption; confirmed via `git diff` that this file has zero changes
  on this branch, and reproduced consistently right at the actual midnight boundary during this
  session's own test runs (a second, related test in the same group failed right after midnight once
  the first one's window closed — filed as **SESSION-36** rather than fixed inline, out of scope
  here).
- `:server:test` — 235 tests, all green on a clean run. One run surfaced 9 failures, all in
  `SessionEventsConsumerIntegrationTest`/`UserFriendEventsConsumerIntegrationTest` (RabbitMQ
  `AmqpIOException`) — the already-documented, already-filed SESSION-22 flake ("~50% flake rate...
  passes in isolation"); confirmed unrelated by re-running both classes alone (all 9 passed).
- Verified the final `GROUP BY 1` query shape against real dev Postgres (a temp-table reproduction
  with a prepared statement matching the exact parameterized shape, both a `viewerZoneId` and a
  `UTC`-default case) — exact expected buckets, not just "query runs".

## "Do we have enough IT?" — a second pass, prompted directly (found real gaps, per SESSION-25's precedent)

Asked explicitly after the ticket was first called done. Checking rather than assuming surfaced two
real, independent gaps:

1. **The actual `V069`/`V070` migrations had never been run against real Postgres at all**, despite
   SESSION-33's own "What was built" claiming live verification — `\d sessions` on the real dev
   container showed `scheduled_start` still `timestamp without time zone` and neither migration in
   `databasechangelog` (0 rows for both). Every "real Postgres" check done for SESSION-33/34 so far
   was a temp-table *reproduction* of the query shape, never the actual migration files running
   against a schema that had gone through the real Liquibase changelog. Root cause not chased further
   (out of scope for this ticket) — likely the container/volume this session's Docker was pointed at
   isn't the same one those tickets originally verified against. **Fixed the gap directly:** started
   `:server:bootRun` against the real dev Postgres, let Liquibase apply the full pending changelog —
   both `V069` and `V070` ran cleanly (confirmed via the boot log's `ChangeSet ... ran successfully`
   lines) — then re-checked `\d sessions`: `scheduled_start`/`scheduled_end_at` are genuinely
   `timestamp with time zone`, no `origin_zone_id` column. Went further and did a real HTTP round
   trip through the running app (register a user, create + cancel a session, hit
   `GET /history?dateCount` with and without `viewerZoneId`, and with an invalid one) — every case
   matched the H2/temp-table-verified expected behavior exactly. Test data cleaned up afterward
   (direct `DELETE`s), app process stopped.
2. **Missing IT coverage for four real scenarios**, none of which the existing tests (all
   single-session, single-call) could have caught a regression in:
   - Two sessions on **different raw UTC calendar dates that merge into one bucket** under a shared
     `viewerZoneId` — the only test that actually proves `GROUP BY 1` re-aggregates correctly
     (`COUNT` = 2) rather than just passing a single already-correct row through unchanged.
   - `before` **combined with** `viewerZoneId` — every prior `before`-cursor test used the UTC
     default; nothing proved the cursor comparison itself uses the same `:zoneId` binding as the
     grouping does, rather than comparing against the raw UTC date.
   - A **DST transition boundary** — `America/Los_Angeles`'s 2026-11-01 fall-back, picked so the
     *correct* (DST-aware) offset and the day's *other* offset disagree on the calendar date by
     construction. Nothing previously exercised real DST behavior; this only ever mattered because
     `AT TIME ZONE`'s IANA-backed correctness was asserted, never actually tested end-to-end for a
     transition.
   - `dateCount` **including a group-linked session alongside a standalone one** — the equivalent
     `date`-based history test existed (`history_includesGroupLinkedSessionsAlongsideStandaloneOnes`)
     but had no `dateCount` counterpart; `findHistoryDateCounts`'s `WHERE` clause never filters on
     `session_type`/`group_id` so this was very likely already correct, but "very likely" isn't
     "verified" — added `history_dateCountIncludesGroupLinkedSessionsAlongsideStandaloneOnes`.

   All 4 new tests added to `SessionListingIntegrationTest.java` and pass. `SessionListingIntegrationTest`
   is now 27 tests (up from 23); `:server:test` re-verified green (235+4 = 239 tests) after adding them.

---

🤖 Generated with [Claude Code](https://claude.com/claude-code)
