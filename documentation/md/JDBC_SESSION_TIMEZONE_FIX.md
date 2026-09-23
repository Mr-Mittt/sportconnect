# JDBC session timezone bug — found, root-caused, and fixed (2026-09-23)

**Status:** Fixed. **Scope:** every environment that runs `server/` — dev, CI, and eventually
prod — not just this dev machine. **Owning module:** `server/` bootstrap
(`SportConnectApplication`), not `modules/session` — the bug lived in the JDBC connection layer,
not in any one query, even though it was only *discovered* through
`SessionRepository.findDiscoverSessions`'s `startTimeFilter`.

## Summary

`GET /api/sessions/discover`'s `startTimeFilter`/`startTime` query params (SESSION-25/35) were
silently returning the wrong sessions on this dev machine — a session scheduled for **19:00**
local time matched a filter asking for **"before or equal 10:28"**, and was simultaneously
excluded by a filter asking for **"after or equal 05:00"** (which it obviously satisfies). Root
cause: the app's own database connections were running in the host machine's real OS timezone
(`Asia/Bangkok`, UTC+7) instead of UTC, which silently broke a query that assumed it was always
reading UTC. Fixed by pinning the JVM's own default timezone to UTC at startup
(`SportConnectApplication.main()`), *not* by trying to configure the JDBC connection string —
that route was tried first and doesn't work against this driver (details below).

## Why this belongs in deployment/infrastructure docs, not just a bug ticket

This isn't a one-off SQL bug. It's a **host-environment dependency** the app had, silently,
without anyone deciding it should: any machine or container that runs `server/` with a non-UTC
OS timezone will hit some version of this, in any query that inspects a stored timestamp's
hour/minute/date components directly (not just `findDiscoverSessions` — see "Other code at risk"
below). Anyone standing up a new deployment target (the AWS EC2 work tracked in
`infra/documentation/BACKLOG_MVP.md`'s INFRA-3..6) needs to know this dependency now no longer
exists, and why — that's the point of this doc existing alongside the infra docs, not buried in a
single module's ticket history.

## How it was found

Investigated live against real data seeded via `documentation/scripts/add-test-data/` (75
standalone Badminton sessions at 5 fixed hour slots — see
`documentation/md/BADMINTON_STANDALONE_SESSIONS_TEST_DATA.xlsx`). A session created for **19:00
Vietnam time** (stored as `2026-09-23T12:00:00Z`) appeared in the results of:

```
GET /api/sessions/discover?sportId=1&startTimeFilter=BEFORE_OR_EQUAL&startTime=10:28&viewerZoneId=Asia/Bangkok&date=2026-09-23
```

— which should be impossible (19:00 is not before 10:28). A second, deliberately paradoxical
query proved it wasn't a fluke:

```
GET /api/sessions/discover?...&startTimeFilter=AFTER_OR_EQUAL&startTime=05:00&...
```

This *excluded* the same 19:00 session — which should also be impossible (19:00 is obviously
after 05:00). A filter that simultaneously "matches before 10:28" and "fails after 05:00" for the
same session is mathematically inconsistent, and pointed straight at the time-of-day
reconstruction logic rather than any date-range or status filter.

## Root cause

`SessionRepository.findDiscoverSessions`'s `startTimeBeforeOrEqual`/`startTimeAfterOrEqual`
clauses (added by SESSION-35, see that ticket's Javadoc in the repository interface for the full
prior history of attempts) reconstruct a session's true local wall-clock time-of-day like this:

```sql
MOD(MOD(CAST(EXTRACT(HOUR FROM s.scheduledStart) * 3600
     + EXTRACT(MINUTE FROM s.scheduledStart) * 60
     + EXTRACT(SECOND FROM s.scheduledStart)
     + :zoneOffsetSeconds AS integer), 86400) + 86400, 86400)
```

This is only correct if `EXTRACT(HOUR/MINUTE/SECOND FROM ...)` returns the **raw UTC** components
of the stored `TIMESTAMPTZ`, so that adding `:zoneOffsetSeconds` (the caller's own resolved
`viewerZoneId` offset) reconstructs local time exactly once.

**That assumption held via a bare `psql` session, but not via the app's own JDBC connections.**
Postgres's `EXTRACT` on a `TIMESTAMPTZ` converts through whatever the *current session's*
`TimeZone` setting is before extracting fields. A manual `psql` session on this box reports
`Etc/UTC` (confirmed via `SHOW timezone;`), and `EXTRACT` correctly returns UTC there. But the
actual Spring Boot application's connections were not using that same session timezone — a
temporary diagnostic (`jdbcTemplate.queryForObject("SHOW TimeZone", String.class)` run at app
startup, before any request) proved the app's own connections reported **`Asia/Bangkok`**, not
UTC.

**Why:** the `pgjdbc` driver issues its own `SET TIME ZONE <value>` command immediately after
opening a connection, using **the JVM's own default timezone** — not whatever the connection URL
or Postgres's own default says. This dev machine's Windows timezone is `SE Asia Standard Time
(Bangkok, Hanoi, Jakarta)` (confirmed via `Get-TimeZone`), which Java maps to the IANA zone
`Asia/Bangkok`. So every connection the app opened was silently re-pinned to `Asia/Bangkok`
by the driver itself, regardless of anything set at the Postgres or URL level.

**The double-shift:** with `EXTRACT` now returning the *already-local* hour (19 for our 19:00
session, not 12), the query's `+ :zoneOffsetSeconds` step added the caller's UTC+7 offset a
*second* time on top of a value that didn't need shifting at all — 19:00 + 7h wraps around a
24-hour clock to 02:00, which genuinely *is* before 10:28 and genuinely *is not* after 05:00. That
double-shifted, wrapped value is exactly what both paradoxical query results were reading against.

## Fix attempted first, and why it doesn't work

The obvious-looking fix is to pin the connection's timezone via the JDBC URL itself:

```
jdbc:postgresql://localhost:5432/sportconnect_dev?options=-c%20TimeZone%3DUTC
```

Postgres's `options` startup parameter is real and does work in general — confirmed directly via
`psql "postgresql://...?options=-c%20TimeZone%3DAsia/Bangkok"` successfully changing that
session's reported timezone. It's applied in this repo's `application.yml`,
`application-dev.yml`, and `application-prod.yml` as a defensive second layer. **But it does not
fix this app on its own**, because pgjdbc's own post-connect `SET TIME ZONE <JVM default>` command
runs *after* the startup-packet option is applied, and silently overrides it. Confirmed live: with
only the URL parameter in place, the startup diagnostic still reported `Asia/Bangkok`, not `UTC`.

## The actual fix

`server/src/main/java/com/sportconnect/SportConnectApplication.java`, first line of `main()`,
before `SpringApplication.run(...)`:

```java
TimeZone.setDefault(TimeZone.getTimeZone("UTC"));
```

This controls the value pgjdbc's own sync step uses, so the driver now sets every connection's
session timezone to UTC — matching what `findDiscoverSessions`'s formula (and
`hibernate.jdbc.time_zone: UTC` in `application.yml`, which governs Hibernate's own
Java-side binding/reading of `java.time` values, a separate concern from the live SQL-session
GUC) already assumed. Confirmed via the same startup diagnostic reporting `UTC` afterward, and via
both paradox queries now returning fully correct, mutually-consistent results (verified against a
clean, untouched day's data — see Verification below).

## Verification

Real end-to-end verification against the live dev backend and Postgres, not a unit test in
isolation (this class of bug is specifically the kind unit/Spock tests with mocked collaborators
cannot catch — see this repo's own `CLAUDE.md` "IT Coverage For All Features" note):

1. Seeded 75 real standalone Badminton sessions (`/addTestData 2026-09-24` — a day untouched by
   real-time drift, avoiding contamination from sessions naturally completing/going `ONGOING`
   mid-investigation) at 5 fixed hour slots: 07:00, 11:00, 15:00, 19:00, 23:00.
2. Before the fix: `BEFORE_OR_EQUAL 10:28` incorrectly returned the 19:00 and 23:00 buckets (24
   sessions) and incorrectly excluded 07:00/11:00/15:00; `AFTER_OR_EQUAL 05:00` incorrectly
   excluded the 19:00 bucket entirely.
3. After the fix (clean rebuild + restart, confirmed via the temporary `SHOW TimeZone` diagnostic
   reporting `UTC`): `BEFORE_OR_EQUAL 10:28` returns **only** the 07:00 bucket (9 of 12 — 3
   excluded because the querying caller happened to be their own creator, a separate, correct
   Discover rule); `AFTER_OR_EQUAL 05:00` returns **all 5** hour buckets (56 sessions:
   9 + 12 + 11 + 12 + 12, the 11-vs-12 discrepancies again explained by the same
   caller-excludes-own-sessions rule, not a bug).
4. The temporary diagnostic bean was removed after confirmation — it is not part of the shipped
   fix.

## Other code at risk (not fixed here — flagged, not audited exhaustively)

Any other query that applies a SQL date/time function (`EXTRACT`, a bare `CAST ... AS date/time`)
directly to a `TIMESTAMPTZ` column inherits the same "assumes UTC" dependency this fix now
satisfies — which is good news going forward (the JVM-level fix covers all of them at once), but
worth knowing the fix is a connection-level guarantee, not something layered per-query. The
`session-impl` module's own `CLAUDE.md` already documents several of these
(`findHistoryDateCounts`, `findDiscoverSessions`) and their individual H2-vs-Postgres quirks — this
fix doesn't change any of that per-query history, it just makes the "what timezone does EXTRACT
see" question have one consistent, correct answer everywhere the app's own JDBC pool is involved.
**Not covered by this fix:** the test suite's H2 database (`server/src/test/resources/
application-test.yml`) — H2 has its own, different timezone-handling mechanism, not the pgjdbc
behavior this fix addresses. If a future test needs to assert real timezone-sensitive query
behavior, that's a separate investigation, not something this fix's JVM-default change reaches.

## Deployment implications going forward

- **This machine's host OS timezone was the trigger, but the fix is host-independent.** Once
  `TimeZone.setDefault(UTC)` runs, the app's own database session timezone is UTC regardless of
  what OS timezone the container/VM it's deployed on happens to have. Standing up the planned AWS
  deployment (INFRA-3..6) does **not** need to separately ensure a UTC host OS — this fix already
  covers that.
- Every environment profile (`application.yml`, `application-dev.yml`, `application-prod.yml`)
  keeps the defensive `?options=-c%20TimeZone%3DUTC` URL parameter as a harmless second layer, in
  case some other, non-Java client ever connects through the same URL without pgjdbc's
  override behavior — it costs nothing and isn't relied on alone.
- If this fix is ever reverted or a future refactor moves `TimeZone.setDefault(...)` to run *after*
  `SpringApplication.run(...)` (e.g. during a bootstrap reorganization), the bug returns silently —
  there's no test currently enforcing that the app's own JDBC connections report UTC. Consider
  whether a lightweight IT assertion (`jdbcTemplate.queryForObject("SHOW TimeZone", ...)`)
  belongs in `server`'s own test suite as a regression guard; not added as part of this fix.
