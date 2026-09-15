# SESSION-25 · Server-side search + column filter on session discover

**Status:** `DONE` (2026-09-15)
**Type:** Enhancement
**Depends on:** SESSION-24 (adds the `PREPARING` status this ticket's status filter includes)
**Filed:** 2026-09-14, user request — the "Join a match" modal (`SessionDiscoverModal`) and the
`/matches` session browser (`SessionDiscoverPanel`) need real search and filter functionality.
Today's only search is a client-side title/location substring filter over whatever single page
`GET /api/sessions/discover` already returned (CLIENT-SESSION-6/7), and the Date/Time/Location
filter pills sketched in CLIENT-SESSION-6's design export render but do nothing.

## Scope

New optional query params on `GET /api/sessions/discover`, AND-combined with each other and with
the existing `sportId` param:

- **`title`** (String) — case-insensitive substring match against `Session.title`. Replaces the
  client-side substring filter with a real server-side one, correct across the full result set
  rather than just the current page.
- **`locationId`** (Long) — exact match against `Session.locationId`.
- **`minOpenSlots`** (Integer) — a session qualifies when its remaining open slots
  (`capacity - participantCount - initialSlot`) minus `minOpenSlots` is `> 0`.
- **`feeType`** (`FeeType`) and/or **`maxFeeAmountVnd`** (Long) — `feeType` exact match;
  `maxFeeAmountVnd` upper-bounds `feeAmountVnd` (meaningful only when `feeType = FIXED`).
- **`date`** (LocalDate) — exact-day match against `scheduledStart`'s date component.
- **`startTimeFilter`** (enum: `BEFORE_OR_EQUAL` / `AFTER_OR_EQUAL`) + **`startTime`** (LocalTime)
  — compares `scheduledStart`'s time-of-day component against the given time. Independent of
  `date` — either can be used alone or together.
- **`status`** (`List<SessionStatus>`, restricted to `PREPARING`/`SCHEDULED`/`ONGOING`) — optional,
  default = all three. **This is a real behavior delta from SESSION-4's original decision**, which
  restricted `/discover` to `SCHEDULED` only ("once a session goes ONGOING it's no longer
  something to discover-and-join"). This ticket supersedes that: `ONGOING` becomes discoverable
  again by default, alongside the new `PREPARING`. Flag this explicitly to whoever reviews/tests
  this ticket — it's an intentional, user-requested change, not a regression.

**Default lower bound:** when neither `date` nor `startTimeFilter` narrows a lower bound,
`/discover` implicitly filters to `scheduledStart >= now()` — both server-side (this ticket) and
client-side as the panel/modal's initial filter state (**CLIENT-SESSION-22**), per the user's
explicit answer during scoping.

**Sort order:** replaces today's plain `scheduledStart ASC` `@PageableDefault` with a 3-level
order, applied on every `/discover` call regardless of which filters are set: `scheduledStart ASC`
→ remaining open slots `ASC` → `createdAt ASC`.

**Who:** Normal User — both existing client surfaces that consume `/discover` via
`useDiscoverModalData`.

**Entry point:** `GET /api/sessions/discover` (existing endpoint, extended — not a new one).

**Edge cases:**
- No filters passed → same response shape as today except the new default status list (all 3),
  the `now()` lower bound, and the new 3-level sort.
- A filter combination matching nothing → empty page, not an error (consistent with SESSION-4's
  existing `sportId`-no-match precedent).
- Invalid values (negative `minOpenSlots`/`maxFeeAmountVnd`, malformed `date`/`startTime`) → 400,
  consistent with existing request validation conventions.
- Deactivated caller: no new endpoint, same accepted JWT-window gap as the rest of this
  controller — not compounded here.

**Out of scope:**
- Session-attribute filtering — **SESSION-26**.
- SESSION-8's ranking algorithm (still `TODO`, unaffected by this ticket) — flagging for whoever
  picks up SESSION-8 next that the sort baseline it plans to replace will have moved to this
  3-level order by the time it lands.
- `/joined` and `/group` endpoints — unchanged.
- Client wiring — **CLIENT-SESSION-22**.

**Cross-domain concept precedent:** the `locationId` filter reuses the session's own existing
`locationId` column (already an established cross-domain id reference since SESSION-1) — no new
precedent needed.

**Tests:** Spock coverage per new param (each filter alone, and at least one combined case), the
3-level sort order, the default status list (all 3 including the new `PREPARING`/`ONGOING`
inclusion), the `now()` lower bound, and empty-page-on-no-match.

## Implementation summary

Built as scoped, but the `date`/`startTime` filters went through significant redesign after two
rounds of real bugs surfaced during verification — see "Two real bugs" below. The final shapes:

- **`session-api`** — new `StartTimeFilter` enum (`BEFORE_OR_EQUAL`/`AFTER_OR_EQUAL`).
  `SessionService.discoverSessions` gains `title`/`locationId`/`minOpenSlots`/`feeType`/
  `maxFeeAmountVnd`/`date`/`startTimeFilter`/`startTime`/`statuses` params (Javadoc documents the
  default status list, the `now()` lower-bound rule, and the fixed sort).
- **`session-impl` repository** — `findDiscoverSessions` is a JPQL query returning
  `Page<Object[]>` of `(Session, openSlots)`: `openSlots` (`capacity - initialSlot -` a correlated
  count of `JOINED` participants) has to appear as a SELECT-list result variable to be legal in
  `ORDER BY` per JPQL's grammar — it can't be inlined there directly. Every optional filter uses
  the `(:param IS NULL OR ...)` null-safe pattern (`GroupRepository.searchPublicGroupsWithCounts`
  precedent), every occurrence defensively `CAST`, per the first bug below. `date` is a half-open
  `[dayStart, dayEnd)` `LocalDateTime` range, not a date cast. `startTimeBeforeOrEqual`/
  `startTimeAfterOrEqual` are plain `Integer` seconds-of-day compared against `EXTRACT`-based
  arithmetic on `scheduledStart`, corrected by a `zoneOffsetSeconds` param via `MOD` — see the
  second bug below and the method's own Javadoc for the full mechanism and why three earlier
  designs each failed differently. Explicit hand-written `countQuery` throughout (Spring Data's
  automatic count-query derivation isn't reliable for a multi-item `SELECT`).
- **`session-impl` service** — `discoverSessions` defaults `statuses` to
  `[PREPARING, SCHEDULED, ONGOING]` when null/empty, computes the `now()` lower bound only when
  neither `date` nor `startTimeFilter` was given, computes `dayStart`/`dayEnd` from `date`,
  computes `zoneOffsetSeconds` (`ZoneId.systemDefault()`'s current offset) only when a `startTime`
  filter is active, reuses the existing `unsorted(pageable)` helper (SESSION-27) to strip the
  caller's `Sort`, and unwraps `Page<Object[]>` back to `Page<Session>` before the existing
  `toResponsePage`/`mapToResponses` batch mapper — no new N+1 surface, `mapToResponses`
  independently recomputes `participantCount`, so `openSlots` is sort-only and never returned to
  the client.
- **`session-impl` controller** — flat `@RequestParam`s (existing convention). Manual
  `BadRequestException` validation ahead of dispatch, same style as `/history`'s: negative
  `minOpenSlots`/`maxFeeAmountVnd`, `startTimeFilter`/`startTime` given as a partial pair, and a
  `status` value outside `PREPARING`/`SCHEDULED`/`ONGOING` — all confirmed with the user during
  Phase 1 rather than assumed.
- **New permanent IT test** — `server/src/test/java/com/sportconnect/integration/
  SessionDiscoverIntegrationTest.java` (27 cases), added specifically because "do we have enough
  IT?" — see "Two real bugs" below for what it caught that nothing else could have.
- **Docs** — `session-impl/CLAUDE.md`: `/discover` added to the endpoints table (previously
  missing entirely), plus a new Gotchas bullet on the timezone issue below, for whoever touches a
  date/time SQL function on `scheduledStart` next.

**Not built here** (as scoped): SESSION-26 (attribute filtering), SESSION-8 (ranking), client
wiring (**CLIENT-SESSION-22**, already filed).

## Two real bugs, neither catchable by a mocked Spock test or the H2 `:server:test` suite

**Bug 1 — Postgres can't infer a bare `IS NULL` parameter's type.** `(:param IS NULL OR ...)`
needs the `IS NULL` side cast too (`CAST(:param AS <type>) IS NULL`), not just the comparison
side. Postgres's extended query protocol resolves each JDBC placeholder's type from *its own*
immediate syntactic context, independently per textual occurrence — a bare `:lowerBound IS NULL`
had none, and failed live with `"ERROR: could not determine data type of parameter $N"`, despite
the same named parameter being fully typed elsewhere in the query (`s.scheduledStart >=
:lowerBound`). Fixed by casting every optional param's `IS NULL` check. Re-verified live that
`GroupRepository.searchPublicGroupsWithCounts`'s similarly-shaped un-cast `:keyword IS NULL` does
**not** reproduce this — temporal types are a sharper edge for Postgres's inference than `String`,
not a universal bug in the null-safe-filter idiom.

**Bug 2 — a systemic timezone bug, found after the user pushed on "do we have enough IT?" and a
new permanent IT test (`SessionDiscoverIntegrationTest`) was added.** This app sets
`hibernate.jdbc.time_zone: UTC` (`server/src/main/resources/application.yml`), which shifts every
stored `LocalDateTime` by the JVM's default-zone offset on write — but that shift is only
*reapplied by Hibernate on a plain attribute read*, not inside a SQL function applied to the same
column. Confirmed directly: `SELECT s.scheduledStart` correctly read `18:00` local, but
`EXTRACT(HOUR FROM s.scheduledStart)` on that same row returned `11` (an exact 7-hour offset,
matching this ICT/UTC+7 host); `CAST(s.scheduledStart AS date)` on an early-morning session
returned the previous calendar day entirely. This broke both new filters:

- `date` (originally `CAST(s.scheduledStart AS date) = :date`) — fixed by switching to a
  half-open `[dayStart, dayEnd)` range against the plain `scheduledStart` path expression, the
  same pattern `findUpcomingSessionsByDate`/`findHistorySessionsByDate` (SESSION-27) already use.
- `startTime` — harder, since "time-of-day regardless of date" has no single date range. Three
  further attempts each failed differently before landing on the fix: (1) a natively-bound
  `LocalTime` compared via `CAST(scheduledStart AS time) >= :param` silently returned wrong rows
  near midnight; (2) switching the parameter to a `String` and keeping `CAST(:param AS time)`
  failed with `"cannot cast type bytea to time without time zone"` (Hibernate never told PGJDBC
  the parameter was text); (3) comparing text-cast values on both sides avoided both errors but
  still returned silently wrong row sets — proven via a raw `PREPARE`/`EXECUTE` in psql that the
  identical comparison, done as a genuine bound parameter outside Hibernate/JDBC, gives the
  correct answer, isolating the fault to Hibernate's translation rather than the SQL itself. The
  fix that actually works: keep `EXTRACT`, but reconstruct the true wall-clock seconds-of-day
  *inside the query* via `MOD(CAST(EXTRACT(...) + :zoneOffsetSeconds AS integer), 86400)` (the
  inner `CAST` is required too — Hibernate's `mod()` rejects `EXTRACT(SECOND)`'s fractional
  `Float` result, which broke Spring context startup entirely until caught), compared against the
  caller's *unconverted* `startTime`. Full mechanism and the two additional PGJDBC/Hibernate
  binding quirks are documented in `SessionRepository.findDiscoverSessions`'s Javadoc.

**A pre-existing, already-shipped instance of this same timezone bug was found in SESSION-27's
`findHistoryDateCounts`** while investigating — not fixed here (a different, already-completed
ticket), filed as **SESSION-31**. **SESSION-30** (the original "CAST vs. generated column"
performance question this ticket's `date`/`startTime` filters were going to face) is now
**superseded** — `CAST` turned out to be a correctness bug, not a performance tradeoff, so neither
option in that ticket applies anymore.

## Verification

- `:modules:session:session-impl:test` — all green, including the rewritten/expanded
  `discoverSessions` Spock cases (one per new filter, a combined-filters case, the default status
  list, the `now()` lower-bound default and its `date`/`startTimeFilter` override, the
  `startTimeFilter` direction mapping, the `dayStart`/`dayEnd` range, the `Pageable`
  sort-stripping, and the pre-existing sportId-narrowing/empty-page cases updated to the new
  signature). These mock `SessionRepository` — they prove the service builds the right call, not
  that the JPQL itself executes correctly (that's what the two bugs above hid from).
- **`SessionDiscoverIntegrationTest`** (27 cases, real `MockMvc` + real H2-backed round trip) —
  all green. Covers every filter alone and combined, the default status list, the `now()`
  lower-bound default and its `date`/`startTimeFilter` override, both sort tiebreak levels
  (`openSlots`, `createdAt`), all four `BadRequestException` validation paths, the
  creator-exclusion/already-joined-exclusion preconditions, and two dedicated regression cases for
  the bugs above: an exact-midnight `startTimeFilter` boundary, and an early-morning session for
  the `date` filter's day-boundary-crossing case.
- `./gradlew :server:test` — full suite green (confirmed after the final fix, separately from the
  targeted `SessionDiscoverIntegrationTest` runs above).
- **Live end-to-end verification against the real dev Postgres** (`:server:bootRun`), across
  several rounds as each bug was found and fixed: registered fresh test users, created standalone
  sessions at known times (including early-morning and near-midnight ones specifically to probe
  the timezone bug), and called `/discover` with curl for every filter alone and combined, all
  four validation paths, the creator-exclusion precedent, and — critically — the exact boundary
  values that had been silently wrong (`startTimeFilter=AFTER_OR_EQUAL&startTime=00:00:00` against
  an evening session; `date` filtering for an early-morning session against both its correct date
  and the wrong previous date the old `CAST` implementation would have matched). Every case now
  matches its expected result exactly on real Postgres, not just H2.

---

🤖 Generated with [Claude Code](https://claude.com/claude-code)
