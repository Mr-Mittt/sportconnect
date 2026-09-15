# SESSION-31 · `findHistoryDateCounts` misbuckets early-morning sessions onto the wrong calendar date

**Status:** `TODO`
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

---

🤖 Generated with [Claude Code](https://claude.com/claude-code)
