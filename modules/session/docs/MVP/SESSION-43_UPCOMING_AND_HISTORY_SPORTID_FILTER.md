# SESSION-43 · `sportId` on `GET /sessions/upcoming` (optional) and `GET /sessions/history` (required)

**Status:** `DONE` (2026-09-24)
**Type:** Feature (contract change — one new query param on two existing endpoints; **required** on
`/history`, so a deliberate breaking change there — see the census)
**Depends on:** SESSION-27 (`DONE`), SESSION-34/35 (`DONE`) — the endpoints and their
`viewerZoneId` handling being extended.
**Blocks:** client **CLIENT-SESSION-23** (`client/docs/BACKLOG_MVP.md`) — its "My sessions" →
Upcoming/History split scopes both sections to the `/matches` page's always-active sport pill, which
cannot be done correctly client-side over server-paginated data (see below).
**Filed:** 2026-09-24, from CLIENT-SESSION-23's pickup — user decision: add the param on the
backend first rather than ship a client-side filter stopgap.
**Revised 2026-09-24 (same session, before implementation):** first filed as optional on both;
user decision → **required on `/history`, optional on `/upcoming`**. Rationale: `sessions.sport_id`
is `NOT NULL` (V039, entity `nullable = false`), and the history sections only ever render for one
sport, so a required param removes the whole optional-param `CAST(... ) IS NULL` pattern from the
history queries. `/upcoming` must stay optional because the `UpcomingMatches` rail (Home Feed has an
"All" sport pill) needs the caller's upcoming sessions across every sport in a single call, and
ticket CLIENT-SESSION-23 item 3 exists specifically to eliminate per-scope fan-out.

## Why

`/matches` always has exactly one active sport (CLIENT-SESSION-29 removed the "All sports" pill).
CLIENT-SESSION-23 shows the caller's "Upcoming sessions" and "History" scoped to that sport. Neither
endpoint takes a sport today, so a client-side filter would break server-side pagination (a page of
20 could come back partly/fully empty while `hasNext` is true) and would make
`/history?dateCount=`'s per-date counts wrong (the server counts every sport's sessions on that
date, so a row could read "(3)" and expand to one card).

## Scope

| Endpoint | `sportId` | Behavior |
|---|---|---|
| `GET /api/sessions/upcoming` | **optional** `Long` | present → only that sport's sessions; absent → exactly today's all-sports behavior |
| `GET /api/sessions/history` (`date=` list **and** `dateCount=` counts) | **required** `Long` | always filtered; missing → 400 via the existing `MissingServletRequestParameterException` handler |

AND-combined with everything already there (`date`, `viewerZoneId`, participant status, session
status). The `dateCount=` shape is filtered too, so per-date counts, `hasMore` and the `before`
cursor all agree with the `date=` lists.

Touch points (all in `modules/session`):
- `SessionController` — `/upcoming`: `@RequestParam(required = false) Long sportId`; `/history`:
  `@RequestParam Long sportId` (required). Update the `@Operation` descriptions.
- `SessionService` (`session-api`) — `getUpcomingSessions(…, Long sportId /* nullable */, …)`;
  `getSessionHistory` and `getSessionHistoryDates` take a non-null `Long sportId`. Javadoc updated.
- `SessionServiceImpl` — pass through. `getRequestedSessions` (SESSION-42) reuses
  `findUpcomingSessions` and passes `null` (no sport filter on Requested — out of scope).
- `SessionRepository`:
  - **Upcoming** (`findUpcomingSessions`, `findUpcomingSessionsByDate`): optional-param guard
    `AND (CAST(:sportId AS long) IS NULL OR s.sportId = :sportId)` — the same pattern
    `findDiscoverSessions` uses for `maxFeeAmountVnd`. The `IS NULL` tests whether the **param** was
    omitted, never the column (`sport_id` is NOT NULL). Verify against real Postgres, not just H2.
  - **History** (`findHistorySessionsByDate` JPQL, `findHistoryDateCounts` native): plain
    `AND s.sportId = :sportId` / `AND s.sport_id = :sportId` — no cast, no null branch.

## Design decision: plain equality, **no** active-sport-profile gate

Cross-domain concept precedent check: `/discover` and `/discover/counts` narrow `sportId` to the
caller's *active `UserSportProfile` sports* and return empty for a sport the caller doesn't hold
(`SessionServiceImpl.resolveEffectiveSportIds`). That gate is right there because Discover shows
sessions the caller could *newly join*. `/upcoming` and `/history` are scoped by the caller's own
`SessionParticipant` row — sessions they already joined or were invited to — so a user who later
dropped a sport profile must still see their existing sessions of that sport. Plain equality is the
correct semantics here; deliberately **not** copying `resolveEffectiveSportIds`. Call this out in
the Javadoc so it doesn't read as an oversight next to `/discover`.

## Edge cases

- Unknown / nonexistent `sportId` → empty result (page with zero elements / `dates: []`), **not** a
  400 — same as an unmatched `locationId` on `/discover`. No `sportService` lookup.
- `sportId` present with no `date` on `/upcoming` is **valid** (unlike `viewerZoneId`, which still
  requires `date` there).
- `/history?dateCount=` with `sportId`: `hasMore` and the `before` cursor are computed over the
  sport-filtered set of dates, so "Load more" doesn't dead-end on a date that has no session for
  this sport.
- **Account lifecycle:** no new authenticated surface — same two endpoints, same
  `@PreAuthorize("hasRole('USER')")`, read-only, results still scoped to the caller's own
  participant rows. A deactivated caller's access-token window is the pre-existing U12 gap; this
  ticket neither widens nor closes it.

## Consumer census (CLAUDE.md § API Change Discipline)

| Consumer | Verdict |
|---|---|
| REST — `/upcoming` | **updated in this change** — optional param, absent = old behavior, compatible for any caller not sending it |
| REST — `/history` | **updated in this change — breaking by design** (required param). Safe because no client caller exists yet (grep `client/src`, `client/e2e`, MSW handlers: zero hits for `sessions/upcoming`/`sessions/history`); CLIENT-SESSION-23 is the first consumer and always sends it |
| `SessionService` (`session-api`) `getUpcomingSessions`/`getSessionHistory`/`getSessionHistoryDates` — grep across `modules/`, `server/` | only `SessionController` calls them (no cross-module caller) — **updated in this change** |
| `SessionRepository.findUpcomingSessions` — also called by `getRequestedSessions` (SESSION-42) | **updated in this change** — passes `null` |
| `SessionServiceImplSpec` (~20 positional-arg stubs across the upcoming/history/dates/requested features) | **updated in this change** |
| `server/.../SessionListingIntegrationTest` — every existing `history_*` case (28 `sessions/history` call sites in `server/src/test`) omits the now-required param and would 400 | **updated in this change** — each gets `sportId=`, plus new sport-filter cases |
| `server/src/test/resources/schema.sql` | already has `sessions.sport_id BIGINT NOT NULL` — compatible as-is |
| Client (`client/src`, `client/e2e/mocks`, `*.test.tsx`) | no caller and no MSW handler exist yet — **compatible as-is** |

## Tests

- Spock (`SessionServiceImplSpec`): `sportId` passed through to each of the four repository methods;
  `null` on `getUpcomingSessions`/`getRequestedSessions` passes `null`.
- IT (`SessionListingIntegrationTest`, real DB): a caller with sessions in two sports gets only the
  requested sport from `/upcoming` (with and without `date=`), `/history?date=`, and
  `/history?dateCount=` — the last proving counts, `hasMore` and the `before` cursor are all
  sport-filtered (including a date holding only the *other* sport's session); `/upcoming` without
  `sportId` still returns every sport; `/history` without `sportId` → 400; unknown `sportId` →
  empty; a sport the caller holds no active profile for still returns their existing sessions (the
  no-gate decision, pinned); `sportId` + `viewerZoneId` together.
- Run the `/upcoming` optional-param cast once against real Postgres (`bootRun`) — record the
  result in the summary.

## Out of scope

- `sportId` on `/requested` (SESSION-42).
- Multi-sport (`sportId` repeated) — single value only, matching `/discover`.
- Group-owner "sessions I manage but haven't joined" gap (still SESSION-27's flagged gap).


## Implementation summary (2026-09-24)

**Built exactly as the (revised) design above — no divergence from the approved plan.**

- `SessionRepository`: `findUpcomingSessions`/`findUpcomingSessionsByDate` gained
  `AND (CAST(:sportId AS long) IS NULL OR s.sportId = :sportId)` + a trailing `Long sportId` param;
  `findHistorySessionsByDate` gained plain `AND s.sportId = :sportId`; native `findHistoryDateCounts`
  gained plain `AND s.sport_id = :sportId`. Javadoc records the no-gate decision and that the `IS
  NULL` tests the *param*, never the (NOT NULL) column.
- `SessionService` (`session-api`) / `SessionServiceImpl`: `getUpcomingSessions(…, Long sportId
  /*nullable*/, …)`; `getSessionHistory`/`getSessionHistoryDates` take a non-null `Long sportId`.
  Pure pass-through — **no** `SportService`/`UserSportProfileService` call (asserted by Spock
  `0 * sportService._` / `0 * userSportProfileService._`). `getRequestedSessions` passes `null`.
- `SessionController`: `/upcoming` `@RequestParam(required = false) Long sportId`; `/history`
  `@RequestParam Long sportId` (required → a missing param is a 400 via the existing
  `MissingServletRequestParameterException` handler, `"sportId is required"`). `@Operation` text
  updated on both.
- No migration, entity, DTO or index change (`sessions.sport_id` already `NOT NULL`, V039).
- N+1 scan: no per-row lookup added anywhere — the change is a `WHERE` predicate on four existing
  queries.

**Consumer census outcome:** as tabled above; a repo-wide grep at implementation time found no
consumer beyond those listed (the `.claude/worktrees/…` hits are a stale worktree copy; `V067` only
names the endpoints in a comment on a participant index). No client caller/MSW handler exists.

**Tests / evidence**
- `SessionServiceImplSpec`: 169 green. ~20 existing call/stub sites updated for the new arg
  (including three `args[5]` → `args[6]` positional-index fixes in the "strips sort" specs); 6 new
  specs (non-null `sportId` passed to `findUpcomingSessions` *and* `…ByDate`; no sport/profile
  service consulted; `getRequestedSessions` passes `null`; `sportId` passed to
  `findHistorySessionsByDate` and `findHistoryDateCounts`).
- **IT changes** — `server/src/test/java/com/sportconnect/integration/SessionListingIntegrationTest`
  (48 green, was 39): 
  - **Updated:** all 28 existing `/api/sessions/history` requests now send `sportId=1` — including
    the four param-combination 400 tests, which would otherwise have kept passing for the *wrong*
    reason (a missing `sportId` is also a 400). Fixtures gained `createSession(…, sportId)` /
    `createSessionAtInstant(…, sportId)` overloads (the old signatures delegate with sport 1).
  - **Added (9):** `upcoming_sportIdNarrowsToThatSportOnly`;
    `upcoming_withoutSportIdStillReturnsEverySport` (incl. an `INVITED` row);
    `upcoming_sportIdIsValidWithoutDateAndCombinesWithDateAndViewerZoneId`;
    `upcoming_unknownSportIdReturnsEmptyPageNotError`;
    `requested_stillReturnsEverySportSinceSportIdIsNotWiredThereYet`;
    `history_dateSportIdNarrowsTheSessionListToThatSport`;
    `history_dateCountSportIdFiltersCountsDatesHasMoreAndBeforeCursor` (sport-1 vs sport-2 dates
    incl. a date holding only the other sport — proves counts, dates, `hasMore` and the `before`
    cursor are all sport-filtered); `history_unknownSportIdReturnsEmptyForBothShapesNotAnError`;
    `history_missingSportIdIsRejectedForBothShapes`. The no-active-profile decision is pinned
    implicitly: this class never creates a `UserSportProfile` row, yet every "returns the sport's
    sessions" assertion passes.
- `:server:test` (full) and `:modules:session:session-impl:test` (full): green, no failing result
  file. These ITs run on **H2**, which cannot prove the `/upcoming` optional-param cast.
- **Real Postgres (dev DB, `bootRun` on :8080, token minted locally, read-only against dev data —
  the dev DB only holds sport 1):** `/upcoming` → 5; `?sportId=1` → 5; `?sportId=999999` → 0; same
  three with `date=…&viewerZoneId=UTC` → 5 / 5 / 0; `/history?dateCount=5` and `?date=` **without**
  `sportId` → 400 `"sportId is required"`; with `sportId=1` → 200 (dates + `hasMore=true` /
  4 sessions); `sportId=999999` → `dates: []` / empty; `/requested` → 200. No parameter-type
  inference error from the null-`Long` cast. Server stopped afterwards.

**Not done / follow-ups:** none new. Client wiring is CLIENT-SESSION-23 (unblocked by this ticket).
The `/requested` endpoint deliberately gets no `sportId`.

---

🤖 Generated with [Claude Code](https://claude.com/claude-code)
