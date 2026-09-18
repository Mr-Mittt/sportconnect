# SESSION-35 · Rewrite `/discover`'s `date`/`startTime` filters for caller-zone semantics, retire the `EXTRACT`+`MOD` correction

**Status:** `DONE`
**Type:** Bug Fix (root-cause) / Refactor
**Depends on:** SESSION-33 (needs `scheduled_start` as `TIMESTAMPTZ`)
**Filed:** 2026-09-16, spawned from `documentation/md/LOCATION_TIMEZONE_DESIGN.md`. Partially
supersedes the timezone-correction code SESSION-25 introduced in
`SessionRepository.findDiscoverSessions` (the `date` half-open range and the `startTime`
`EXTRACT`+`MOD` correction) — not SESSION-25's feature scope itself. The 8 filter params and the
3-level sort stay exactly as shipped; the default status list is also unchanged. **Delta from this
description found mid-ticket:** `date` itself does change shape — see "Scope change (2026-09-18,
second)" below, which made it required instead of optional. Everything else here is exactly the
timezone-mechanics-only scope this paragraph originally described.

SESSION-25's `date`/`startTime` filters were made correct against the *server's* JVM zone — the same
implicit assumption behind SESSION-31. Per `documentation/md/LOCATION_TIMEZONE_DESIGN.md` §3, a
`/discover` time-of-day filter is inherently **caller-relative**: "sessions starting before 9am"
only means something in the searching caller's own clock, not the session's location's clock.

**Scope correction (2026-09-17, mid-SESSION-34):** the design doc originally framed this as a
*different* canonical zone than `/history?dateCount`'s (session's location/origin zone vs. caller's
zone). That framing didn't survive SESSION-34's own implementation — a personal history view has
the same "caller-relative" property `/discover` does (pinning a date to somewhere the viewer no
longer is can show a completed session as "in the future" relative to the viewer's own current
clock), so SESSION-34 also ended up bucketing by the caller's own current zone, not the session's.
**Both endpoints now want the same kind of zone (the caller's current one) for different purposes**
(a time-of-day filter vs. calendar-date bucketing) — not two different zones. SESSION-34 established
a concrete precedent worth following here for consistency: an optional `viewerZoneId` query param
(IANA zone id), validated via `ZoneId.of(...)` → 400 if invalid, falling back to a fixed default
(`"UTC"`) when omitted rather than failing the request — see `SessionServiceImpl
.getSessionHistoryDates`/`DEFAULT_ZONE_ID` (renamed from `DEFAULT_HISTORY_ZONE_ID` once this ticket
made it shared across every zone-aware method, not history-specific). `Session.originZoneId`/
`location.timezone` are
no longer part of either endpoint's zone story — `origin_zone_id` was fully removed (`V070`) once
its only reader (SESSION-34's original design) was replaced by this caller-zone model.

## Scope change (2026-09-18)

While clarifying this ticket's scope, found that `getSessionHistory`'s `date` param
(`GET /api/sessions/history?date=`) and `getUpcomingSessions`'s `date` param
(`GET /api/sessions/upcoming?date=`) share the **exact same JVM-zone day-boundary bug** as
`/discover`'s `date` filter — both compute their `[dayStart, dayEnd)` range via
`date.atStartOfDay(ZoneId.systemDefault()).toInstant()`, and both Javadocs already flag this as a
"SESSION-33 JVM-zone day-boundary placeholder" with no follow-up ticket named. Decided (user call,
2026-09-18) to fix all three in this same ticket rather than fixing `/discover` alone and filing
separate tickets — the fix is the identical one-line pattern already agreed for `/discover`'s
`date` (compute the `Instant` bounds using the caller's resolved zone instead of
`ZoneId.systemDefault()`, no query change needed), so it's cheap to do once while already touching
this bug class.

**Added to scope:**
- `getSessionHistory`/`GET /api/sessions/history?date=` gains the same optional `viewerZoneId`
  param, falling back to `"UTC"` (`SessionServiceImpl.DEFAULT_ZONE_ID`) when omitted, same as
  `getSessionHistoryDates` already does for `dateCount`. Note `/history` already accepts
  `viewerZoneId` today, but only alongside `dateCount` (rejected otherwise) — this widens it to
  also be valid alongside `date`.
- `getUpcomingSessions`/`GET /api/sessions/upcoming?date=` gains a new optional `viewerZoneId`
  param (doesn't exist on this endpoint at all today), same fallback.
- Both get their own consumer census (new optional query param — check client callers) before
  implementing.

**Consumer census (2026-09-18):** grepped the client for `/sessions/upcoming` and
`/sessions/history` — no live client code calls either endpoint today (`useJoinedSessions` only
calls `/sessions/joined`); the only references are in **CLIENT-SESSION-23** (`TODO`, the ticket that
will build the "My sessions" upcoming/history split against these two endpoints) and
**CLIENT-SESSION-24** (`TODO`, already scoped to send `viewerZoneId` to `/discover` and
`/history?dateCount`). Both new params are additive/backward-compatible (nothing breaks today), but
**CLIENT-SESSION-24's scope was updated** to also send `viewerZoneId` to `/upcoming?date` and
`/history?date` once CLIENT-SESSION-23 wires those calls up — see that ticket file — so the
follow-up is filed, not just noted here.

## Scope change (2026-09-18, second): `/discover`'s `date` becomes required

While discussing this ticket's completed work, the user pointed out (correctly) that `date`'s
optionality on `/discover` should end — it should be a required param, not optional. **Consumer
census run before implementing** (API Change Discipline): found a real, live, already-shipped
client consumer — `client/src/features/session/hooks/useDiscoverSessions.ts` calls
`GET /sessions/discover` with only `sportId`, no `date` at all, backing the Matches page's
Discover panel and the rail-triggered Discover modal (both CLIENT-SESSION-6) — a general "browse
every upcoming joinable session" view, not a day-scoped one. Flagged this to the user before
proceeding (making `date` required would immediately break that live feature); **user decision:
proceed anyway, and fix the client to always send a date too** (accepting the resulting UX
narrowing as a deliberate tradeoff, not an oversight).

**A second consequence surfaced and was also explicitly confirmed before implementing:**
`startTimeFilter`/`startTime` previously worked *without* `date` to mean "any day, just this
time-of-day" (e.g. "anything starting after 6pm, any date" —
`startTimeFilter_afterOrEqual_matchesOnlyTimeOfDayAtOrAfterGivenTimeRegardlessOfDate`, a real test
proving it). Since `date` and `startTimeFilter` are ANDed in the query, making `date` required
means `startTimeFilter` can only ever narrow **within** that one required date now — the
"any day" time-of-day search mode is gone entirely, not just multi-day Discover browsing.
User confirmed proceeding with this understood.

**Implemented:**
- `SessionController.discoverSessions`: `date` is now `@RequestParam LocalDate date` (no
  `required = false`) — a missing value 400s via Spring's existing
  `MissingServletRequestParameterException` → `GlobalExceptionHandler` handling (message
  `"date is required"`, same pattern already used elsewhere, e.g. `location-impl`). The
  `viewerZoneId` given without `date`/`startTimeFilter` 400 is removed — no longer reachable once
  `date` can't be null, so `viewerZoneId` is now always meaningful.
- `SessionServiceImpl.discoverSessions`: `dayStart`/`dayEnd` are now unconditional
  (`date.atStartOfDay(zone)...`, no null-check); the old `now()`-default `lowerBound` (applied when
  a caller omitted both `date` and `startTimeFilter`) is dead code now that combination can't
  happen — always passes `null` for it. Left `SessionRepository.findDiscoverSessions`'s
  `lowerBound` param/query clause in place rather than removing it (a harmless, always-taken
  `IS NULL` branch) — not worth the mechanical churn of dropping a parameter from an
  otherwise-untouched query for a single caller-side ternary's removal.
- **Consumer census outcome, backend:** `SessionController` is `discoverSessions`' only backend
  caller (grepped all modules) — updated directly, above.
- **Consumer census outcome, client:** `useDiscoverSessions.ts` — **updated in this change**: now
  always sends `date` = the browser's own today (`date-fns` `format(new Date(), 'yyyy-MM-dd')`,
  same pattern `groupSessionsByDate.ts` already uses), added to `sessionKeys.discover`'s cache key.
  This is an accepted, real regression (Discover can no longer show tomorrow's sessions) —
  **follow-up ticket filed**, not just noted: **CLIENT-SESSION-25** (`client/docs/BACKLOG_MVP.md`,
  `TODO`) — a real date picker to restore multi-day browsing. `useMatchesPageData`/
  `useDiscoverModalData` needed no change (they don't touch `/discover`'s params directly).
  `client/e2e/mocks/handlers/sessions.ts`'s `/api/sessions/discover` MSW handler already ignores
  unrecognized query params, so it needed no change to keep existing E2E/component tests green —
  it does not yet enforce/mirror the backend's now-required `date`, a known MSW/contract fidelity
  gap noted here rather than silently left unmentioned.
- Existing tests updated for the new required param and the `startTimeFilter`-without-`date`
  removal: `SessionServiceImplSpec` (every `discoverSessions(...)` call site that reaches the
  `date.atStartOfDay(...)` line now passes a real date;
  `discoverSessions with a viewerZoneId but no date or startTimeFilter resolves the zone harmlessly`
  removed — that scenario can't happen through the controller anymore), and
  `SessionDiscoverIntegrationTest` (every request gains `date`/`viewerZoneId` params matching its
  fixtures; `defaultLowerBound_excludesAPastSessionWhenNeitherDateNorStartTimeFilterGiven` and
  `startTimeFilter_optsOutOfTheNowLowerBoundJustLikeDateDoes` removed — both tested the
  now-impossible no-date case; `startTimeFilter_afterOrEqual_matchesOnlyTimeOfDayAtOrAfterGivenTimeRegardlessOfDate`
  rewritten to `..._matchesOnlyTimeOfDayAtOrAfterGivenTime` with both fixtures on the same required
  date, since "regardless of date" is no longer a real capability to test; new
  `date_isRequiredRejectsBeingOmitted`).

  **"Do we have enough IT?" asked directly after this scope change was first called done — found
  two real gaps, same as SESSION-25/27/34's own precedent:** (1) no test proved `startTimeFilter`
  actually stopped matching "any day" once `date` became required — every rewritten test only put
  its fixtures on the one required date, which would pass identically whether or not the AND with
  `dayStart`/`dayEnd` was actually wired correctly; added
  `startTimeFilter_excludesAMatchingTimeOfDayOnADifferentDateThanTheRequiredDate` (a same-time-of-day
  session on the *next* day, confirmed excluded). (2) `date`'s own exclusion behavior was never
  directly proven even before this ticket — every existing `date` test (`dateFilter_*`) saved only
  the one session expected to match, never a same-shape distractor on a different day; added
  `dateFilter_excludesASessionOnADifferentDate`. Both added and green.

  Green: `session-impl` (173 tests) + `SessionDiscoverIntegrationTest` (30 tests, up from 28) +
  `SessionListingIntegrationTest` (existing, unaffected), both fully green against real Postgres via
  Testcontainers — a full `:server:test` run could not be completed this session due to an
  unrelated Docker Desktop/Hyper-V outage on the dev machine, not a code issue (see
  `documentation/sessions/` log for this session). Client: `tsc -b` clean, targeted Vitest green
  (`useAddSportProfile`, `MatchesPage`, `useMatchesPageData`, `HomeFeedPage`, `FriendsPage` —
  47 tests), `matches-journey.spec.ts` E2E green (3 tests).

## Scope

- `findDiscoverSessions`: `startTime` comparisons were originally planned to become
  `EXTRACT(HOUR FROM s.scheduled_start AT TIME ZONE :callerZone) ...` (replacing the
  `zoneOffsetSeconds`/`MOD` correction entirely, since `AT TIME ZONE` handles DST correctly
  per-value where the `MOD`-based correction structurally can't) — **not what shipped**, see the
  resolved `startTime` bullet below for why.
- `date` — resolved: kept the existing half-open `[dayStart, dayEnd)` shape, just computed against
  `resolveZone(viewerZoneId)` instead of `ZoneId.systemDefault()`. No `AT TIME ZONE` expression
  needed for `date` at all — it's a plain `Instant` range comparison built service-side (unlike
  `startTime`, which is a per-row extraction that has to happen in the query), so the fix is a
  one-line zone swap, not a query change.
- `startTime` — resolved: HQL has no `AT TIME ZONE` operator, and the Postgres function-call
  passthrough (`function('timezone', :zone, s.scheduledStart)`) that compiles fine fails against H2
  at execution (`Function "timezone" not found` — see `session-impl/CLAUDE.md`'s gotchas and
  `SessionRepository.findDiscoverSessions`'s Javadoc for the full trail). Kept the existing
  `EXTRACT`+offset-shift correction, now sourced from the caller's resolved zone instead of the
  JVM's — correct unconditionally for a non-DST caller zone, with an accepted residual DST-across-
  seasons gap documented on the repository method.
- Regression tests: real-Postgres verification alongside H2, same discipline SESSION-31's reverted
  attempt established for this bug class — done via `SessionDiscoverIntegrationTest`/
  `SessionListingIntegrationTest` (both run against real Postgres via Testcontainers, `BaseIT`), not
  just the H2-backed Spock unit specs.

## Open questions — resolved during implementation

- **Caller-zone sourcing — resolved: same `viewerZoneId` param/shape as `/history`.** `/discover`
  reuses the exact `viewerZoneId` param name and shape SESSION-34 already established for
  `/history?dateCount` — optional query param, `ZoneId.of(...)`-validated with a 400 on invalid
  input, falling back to `"UTC"` when omitted — rather than diverging (no header, no required-param
  variant). One caller-facing zone param name across every zone-aware listing endpoint
  (`/discover`, `/upcoming`, `/history` for both `date` and `dateCount`) was judged clearly better
  than a per-endpoint bespoke shape; `SessionServiceImpl.resolveZone` is the single shared
  resolution/validation point all four now call.

## Out of scope

`/history?dateCount`'s bucketing (SESSION-34 — same kind of zone, the caller's own, but used for
calendar-date bucketing rather than a time-of-day filter) and every other `/discover` filter param
untouched by timezone (`title`, `locationId`, `minOpenSlots`, `feeType`, `maxFeeAmountVnd`, `status`).

---

🤖 Generated with [Claude Code](https://claude.com/claude-code)
