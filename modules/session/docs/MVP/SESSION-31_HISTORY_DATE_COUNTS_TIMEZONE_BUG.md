# SESSION-31 · `findHistoryDateCounts` misbuckets early-morning sessions onto the wrong calendar date

**Status:** `SUPERSEDED` (2026-09-16)
**Type:** Bug Fix
**Depends on:** none
**Filed:** 2026-09-15, found while implementing and debugging SESSION-25's own `date`/`startTime`
discover filters — a confirmed, real, **already-shipped** production bug, not something SESSION-25
introduced. Confirmed via a permanent IT test (`SessionDiscoverIntegrationTest`) and reproduced
independently on both the H2 test profile and real Postgres.

This app sets `spring.jpa.properties.hibernate.jdbc.time_zone: UTC` (`server/src/main/resources/
application.yml`). That setting shifts every stored `LocalDateTime` by the JVM's default-zone
offset on write — e.g. `18:00` local becomes `11:00` raw-stored, on a UTC+7 host — but that shift
is only **reapplied by Hibernate on a plain attribute read** (confirmed: `SELECT s.scheduledStart`
correctly returns `18:00` local). A SQL date/time function applied directly to the column in the
same query reads the raw, un-reapplied value instead (confirmed: `EXTRACT(HOUR FROM
s.scheduledStart)` on that same row returned `11`; `CAST(s.scheduledStart AS date)` on an
early-morning, `03:00`-local row returned the **previous** calendar day entirely).

`SessionRepository.findHistoryDateCounts` (SESSION-27, backs `GET /api/sessions/history?dateCount`)
is a **native** SQL query using exactly this pattern — `CAST(s.scheduled_start AS date) AS
sessionDate`, both in the `SELECT`/`GROUP BY` and in the `before`-cursor `WHERE` comparison. Being
native (not JPQL), Hibernate's attribute-level reconversion never applies to it at all, so every
session scheduled between local midnight and wherever the UTC shift stops crossing a day boundary
(~7 hours on this UTC+7 dev host; the exact window depends on the deployed server's timezone) gets
bucketed into the **previous day's** history-date bucket instead of its real one. This is a live,
already-shipped discrepancy in the distinct-dates-with-counts list and the `before` cursor's paging
for any user with early-morning sessions in their history — not a hypothetical.

**Why not fixed in SESSION-25 directly:** different, already-completed ticket. SESSION-25's own
`date`/`startTime` filters were fixed by avoiding `CAST`/`EXTRACT` on `scheduledStart` entirely —
`date` via a half-open `[dayStart, dayEnd)` `LocalDateTime` range (matching the pattern
`findUpcomingSessionsByDate`/`findHistorySessionsByDate` already use), `startTime` via `EXTRACT` +
a JVM-offset correction computed in `SessionServiceImpl`. `findHistoryDateCounts`'s fix will look
different since it's a **native query doing a `GROUP BY` on the date itself** (not a single-row
comparison), and a native query can't fall back to a plain JPQL attribute-comparison trick the way
`findDiscoverSessions` could — this needs its own design pass at pickup, e.g. grouping by a
computed local-date expression using the same JVM-offset correction, or reconsidering whether this
query should read a per-deployment configurable offset instead of implicitly relying on the JVM's
default zone (which is also a live assumption `SessionServiceImpl`'s new `startTime` fix makes —
worth resolving both consistently, not just patching this one query in isolation).

**Out of scope:** any change to `hibernate.jdbc.time_zone` itself, or any other query — this ticket
is scoped to `findHistoryDateCounts` specifically. A broader audit of every other Java/system-timezone
assumption in this module (or the wider app) is a separate, bigger conversation.

**Tests:** a session scheduled in the first few hours of the local day must appear in
`GET /api/sessions/history?dateCount`'s results under its own calendar date, not the previous one;
regression coverage should use the same "genuinely cross the day boundary" fixture shape
`SessionDiscoverIntegrationTest`'s `dateFilter_matchesAnEarlyMorningSessionOnTheCorrectCalendarDay`
test uses, not a mid-day time that can't expose the bug.

## Superseded — not shipped

A JVM-offset-correction fix (matching `findDiscoverSessions`' `EXTRACT`+`MOD` pattern, adapted to a
direct timestamp shift for this query's `GROUP BY`) was implemented, verified green on both H2 and
real Postgres, and then **deliberately reverted before merge** — not because it didn't work, but
because a follow-up conversation right after it landed surfaced the deeper problem it was patching
over: `scheduledStart` carries no timezone information at all, so *any* offset correction here can
only ever be correct for the server's own JVM zone, never a client's. Shipping the point-fix would
have meant re-doing this same category of work again once the real fix landed, and would have left
`session-impl` maintaining two different timezone-correction idioms (this one's timestamp shift,
`findDiscoverSessions`' `EXTRACT`+`MOD`) at once.

The full reasoning, a validated `TIMESTAMP` vs. `TIMESTAMPTZ` example against real Postgres, and the
proposed real fix (`Location`-owned timezones, `Session.scheduledStart` as a true instant, `AT TIME
ZONE` replacing every hand-derived offset correction in this module) live in
**`documentation/md/LOCATION_TIMEZONE_DESIGN.md`**. That design is now split into concrete
implementation tickets:

- **LOC-4** — `Location` gains a real IANA timezone (foundational, no dependency on this ticket)
- **SESSION-33** — `Session.scheduledStart` becomes a true instant, plus a creator-zone fallback for
  location-less (`PREPARING`/standalone) sessions
- **SESSION-34** — rewrites `findHistoryDateCounts` (this ticket's own query) using `AT TIME ZONE`
  — **the actual fix this ticket was chasing**, done the durable way instead of the point-patch way
- **SESSION-35** — rewrites `/discover`'s `date`/`startTime` filters the same way, retiring the
  `EXTRACT`+`MOD` correction SESSION-25 introduced
- **CLIENT-SESSION-24** — client submits an offset-aware `scheduledStart` and its own browser
  timezone (`Intl.DateTimeFormat()`, no permission prompt needed) instead of a bare `LocalDateTime`

This ticket's own diagnosis (the Hibernate write-shift mechanism, the exact early-morning failure
mode, the regression-test shape) stays fully valid and reusable — everything above it in this file
is still the correct description of the bug. Only the **fix** changed, from a local patch to a
root-cause redesign.

---

🤖 Generated with [Claude Code](https://claude.com/claude-code)
