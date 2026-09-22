# SESSION-39 · New `SessionCount` endpoint — per-date session counts for Discover's date-section overview

**Status:** `DONE`
**Type:** Feature
**Depends on:** SESSION-37 (`DONE`) — needs `Session.isPublic` and the redesigned
`idx_sessions_sport_id_standalone` (`WHERE is_public = true`) it introduces.
**Filed:** 2026-09-21, split out of SESSION-37 by user decision — the "browse many days, see counts
per day" job that motivated SESSION-37's original (later reverted) `List<LocalDate>` design belongs
to its own endpoint, not to `/discover` itself. Full decision trail, every query shape tried, and
real `EXPLAIN ANALYZE` evidence backing this design: `documentation/md/adr/
DISCOVER_SCHEDULED_START_FILTER_ADR.md`.

## What it is

A new endpoint giving the count of discoverable sessions per date, across a small, capped set of
dates — the data a UI needs to render date-section headers (e.g. "Mon 22 — 3 sessions", "Tue 23 — 0
sessions") *before* the caller picks one specific day to drill into via `/discover`
(`GET /api/sessions/discover`, SESSION-37's final single-required-`date` shape). No session list, no
pagination — just `(date, count)` pairs.

## Request shape

Shares the same optional filter params as `/discover` **except `date` and pagination**:

| Param | Shape | Notes |
|---|---|---|
| `sportId` | optional `Long` | same semantics as `/discover` — omitted defaults to the caller's active sport profiles |
| `title` | optional `String` | same as `/discover` |
| `locationId` | **optional `List<Long>`** | **scope change (2026-09-22, user decision at pickup):** unlike `/discover`'s single-value exact match, this endpoint accepts multiple `locationId` values (repeated query param), OR-combined — a session qualifies if its `locationId` is any of the given values. `sportId` stays single-value, matching `/discover` exactly (explicitly confirmed, not changed). |
| `minOpenSlots` | optional `Integer` | same as `/discover` |
| `feeType` | optional `FeeType` | same as `/discover` |
| `maxFeeAmountVnd` | optional `Long` | same as `/discover` |
| `viewerZoneId` | optional `String` (IANA zone) | same as `/discover`, falls back to UTC |
| `status` | optional `List<SessionStatus>` | same as `/discover` — default drops `ONGOING`, explicit `ONGOING` silently stripped, other invalid values 400 |
| `startTimeFilter` | optional, independently | same as `/discover`'s final shape (SESSION-37 §3) |
| `startTime` | optional, independently | same as `/discover`'s final shape |
| `date` | **`List<LocalDate>`, optional** | different from `/discover` — see below |
| pagination | **none** | result is at most 8 `(date, count)` pairs, no `Page`/cursor |

**Sharing the filter set with `/discover` is deliberate, not incidental** — it's what makes the
returned counts *accurate* against what `/discover` would actually show if the caller drilled into
that date (same sport gate, same optional filters, same exclusions). This is a live query, not a
cache, specifically to avoid the caller-specific-filtering problem the ADR's §4c cache design got
stuck on (a shared cache can't encode per-caller exclusions or optional filters; a live query
naturally does).

## `date` semantics

- **Omitted (default):** count `PREPARING`/`SCHEDULED`, `isPublic = true` sessions for **today and
  the next 7 days** (8 calendar days total, in the resolved `viewerZoneId`).
- **Given, as a list of specific dates:** any date `< today` is **silently dropped**, same
  "clamp/ignore past dates, never a 400" spirit as `/discover`'s final design (SESSION-37 §3) — just
  applied per-date to a list here instead of a single clamp.
  - If every given date is in the past (nothing survives), **resolve at pickup**: fall back to the
    default 8-day window (consistent with SESSION-37's original List-based design's "empty survivor
    list → default case" rule), or return an empty result. Not explicitly decided by the user —
    flagged here rather than assumed.
- **Cap: more than 8 dates in the list is a 400**, not a silent truncation — explicit, deliberate
  choice (unlike `/discover`'s own past-date handling, which is silent). The cap number (8) matches
  the default window size (today + 7 = 8) — the default is already "the max the endpoint will ever
  return in one call."
- Each survivable date's own semantics (matches SESSION-37's per-day boundary logic, applied
  per-date instead of to one clamped value): `date == today` → `[now(), dayEnd(today))`; `date >
  today` → `[dayStart(date), dayEnd(date))`.

## `startTimeFilter`/`startTime`

Identical rules to `/discover`'s final shape (SESSION-37 §3) — independently optional, not a strict
pair:
- Both given → time-of-day comparison in the given direction, AND-combined with each date's window.
- `startTime` given, `startTimeFilter` omitted → defaults to `AFTER_OR_EQUAL`.
- `startTimeFilter` given, `startTime` omitted → **meaningless, silently ignored** (a filter
  direction with no threshold value) — same as `/discover`.
- Neither given → no time-of-day filter.

## Response shape

`List<SessionDateCount>` (or similar — exact type name TBD at pickup, matching this module's
existing naming), each entry `{ date: LocalDate, count: int }`. **Must include every date in the
effective window/list, even ones with zero matching sessions** — a plain `GROUP BY` naturally omits
empty buckets entirely (confirmed with real data in the ADR's §0c: a 7-date test query returned only
5 rows for 7 requested dates, silently missing the two zero-count days), so the service layer must
explicitly backfill missing dates against the full requested/default list before returning, not rely
on the query's own row set. This was demonstrated as a real, not hypothetical, behavior in the ADR —
don't rediscover it by shipping the bug.

## Implementation guidance (not a full design — resolve/verify at pickup)

- **"Double check with history" (user's own words at filing):** `SessionServiceImpl
  .getSessionHistoryDates`/`SessionRepository.findHistoryDateCounts` (SESSION-27/34) is the closest
  existing precedent in this module for a "distinct dates + counts" shape — review its method
  naming, DTO shape (`SessionHistoryDatesResponse`/`SessionHistoryDateCount`), and native-query
  conventions (ordinal `GROUP BY 1` — not the repeated expression, an H2-specific gotcha; `TO_CHAR(x
  AT TIME ZONE zone, 'YYYY-MM-DD')` — never a bare `CAST` — before designing this endpoint's own
  query/DTOs, for consistency and to avoid re-hitting gotchas that query's own Javadoc already
  documents in detail.
- **Query style: user prefers "Query C" style** — a native query, per-row `AT TIME ZONE` +
  `TO_CHAR` + `GROUP BY 1`, matching `findHistoryDateCounts`'s own pattern — **but re-verify this
  preference once SESSION-37's index redesign (§2, the `is_public = true` partial index) actually
  exists**, not against the old `group_id IS NULL`-scoped index the ADR's tests ran against. The
  ADR's §0c comparison (Query C vs. the `CASE WHEN SUM`-based "Query D") found C winning cleanly in
  the plain contiguous-window case, but a wash once `startTimeFilter` was added, and — critically —
  **found genuinely different results for a non-contiguous date list** (this endpoint's actual
  shape) depending on `sport_id = <single value>` vs `IN (...)`, and found that *neither* C nor D
  got the date conditions pushed into an index at this row count regardless of query shape. Don't
  assume the ADR's conclusion transfers unchanged — re-run the comparison against the new index and
  real request shape (8, not 7, dates; a list, not a contiguous range) before committing to a query.
- **`sport_id` predicate form:** the ADR found `sport_id = <single value>` (matching the client's
  actual sport-switcher-scoped usage) behaves differently from `sport_id IN (...)` for index
  selection — test against whichever shape this endpoint's real default caller-active-sports
  resolution actually produces (could be 1–3 values, per the "up to 3 sport profiles" cap in
  `client/CLAUDE.md`), not just the single-value case the ADR tested.
- Migration/entity work for `Session.isPublic` and the index redesign live in SESSION-37, not here
  — this ticket only *consumes* them.

## Consumer census (do at pickup, CLAUDE.md § API Change Discipline)

New endpoint — no existing consumers to break, but the client side needs a new hook/UI to actually
call it (not built here — flag as a client follow-up ticket the moment this ships, per CLAUDE.md's
"file the moment it comes out" rule, likely enhancing CLIENT-SESSION-25's date picker per the delta
note already added there).

## Out of scope

- Pagination/cursor over dates beyond the 8-day cap — the 8-date cap is a hard ceiling, not a
  paginatable window; a caller wanting to browse further out makes a new request with different
  dates.
- The client UI/hook that calls this endpoint — backend-only ticket, client follow-up filed
  separately once this ships.
- Changing `isPublic`/index behavior — owned by SESSION-37.

## Scope change (2026-09-22, at pickup)

User decision: `locationId` becomes a **multi-value** filter (`List<Long>`, repeated query param,
OR-combined — a session qualifies if its `locationId` is any of the given values), unlike
`/discover`'s single-value exact match. `sportId` explicitly confirmed to stay single-value,
unchanged from `/discover`. Written into the Request shape table above.

## Implementation summary (2026-09-22)

**Endpoint:** `GET /api/sessions/discover/counts` (chosen over a flat `/discover-counts` or
`/counts` — nested under `/discover` since it's explicitly the pre-drill-down overview for that
same feature). Same controller (`SessionController`), same `@PreAuthorize("hasRole('USER')")` +
`Authentication`/`SecurityUtils` extraction convention as every other endpoint in this file.

**session-api:**
- `SessionDiscoverDateCount` (`{date, count}`) and `SessionDiscoverDateCountsResponse`
  (`{counts: List<SessionDiscoverDateCount>}`) — new types, not a reuse of `SessionHistoryDateCount`
  (same shape, but a semantically distinct endpoint — user decision at pickup).
- `SessionService.getSessionDiscoverDateCounts(...)` — full param list mirrors `discoverSessions`
  except `date`→`dates` (`List<LocalDate>`) and no `Pageable`; `locationId` is `List<Long>`
  (the scope change above).

**session-impl — service layer:**
- Extracted two helpers shared with `discoverSessions` (refactor, no behavior change to that
  method): `resolveEffectiveSportIds` (the active-`UserSportProfile` gate) and
  `resolveStartTimeFilter` (the `StartTimeFilter`/`startTime`→`MOD`+`zoneOffsetSeconds` resolution).
- Date-list resolution: omitted → today+7 days (8 total); given → drop any date `< today` silently,
  sort/dedupe ascending; **if every given date is in the past, returns `{counts: []}` immediately
  with no query — the default window is not substituted** (explicit user decision, ticket originally
  flagged this as undecided).
- `sportId` not one of the caller's active sports, or zero active profiles → every effective date
  backfilled to `count=0` without querying (mirrors `discoverSessions`' empty-page behavior).
- Query row set is backfilled against the full effective date list afterward (`count=0` for any
  date `GROUP BY` omitted) — the ticket's explicit, ADR-demonstrated requirement.
- **Account lifecycle:** no explicit `isActive` check added — matches `/discover`'s own existing
  precedent (no check anywhere in `session-impl` today, tracked under user `U12`); this endpoint
  shares `/discover`'s exact gating shape, so diverging here would be a one-off inconsistency, not a
  real fix of the known gap (user decision at pickup).

**session-impl — repository (`SessionRepository.findDiscoverDateCounts`, native):** the ADR's
benchmarked "Query C" shape (`AT TIME ZONE`+`TO_CHAR`+ordinal `GROUP BY 1`, same as
`findHistoryDateCounts`), combined with `discoverSessions`' own `MOD`-based `startTimeFilter`
mechanism (kept deliberately, not swapped for a direct `AT TIME ZONE` extraction, even though this
query is native and could — see the ADR's §0c for why "already-tested" beat "theoretically better
but unverified"). `TO_CHAR(...) IN (:dateStrings)` restricts to exactly the requested calendar
dates per `zoneId`; a separate `<> :todayStr OR >= :nowInstant` clause adds back the
`date==today→floor at now()` rule the date-string equality alone can't express. `locationIds`
uses an explicit `hasLocationIds` boolean flag rather than a `:locationIds IS NULL` check, since
binding a null `List` to a native `IN (:param)` has no proven-safe precedent in this codebase — the
service always passes a non-empty list (a `List.of(-1L)` sentinel when the caller omits
`locationId`).

**Query re-verification (per the ticket's explicit instruction) — done against real dev Postgres,
seeded with 1,000 synthetic rows in a rolled-back transaction (same methodology as the ADR's own
§0c):** confirmed the ADR's finding transfers cleanly to the redesigned
`idx_sessions_sport_id_standalone`. `sport_id = <single value>` uses that index directly via an
`Index Cond` on `(sport_id, scheduled_start)` — 0.92ms execution. `sport_id IN (<3 values>)` falls
back to `idx_sessions_status_scheduled_start` instead (a plain filter on `sport_id`/`is_public`) —
1.97ms execution. Both fast at this row count; this endpoint's caller-active-sports resolution can
produce 1–3 values (client's "up to 3 profiles" cap), so both shapes occur in practice and neither
is a performance concern. Rollback verified clean (`sessions`/`session_participants` back to their
original 27/29 rows).

**Consumer census:** new endpoint, zero existing consumers (confirmed via grep across backend +
`client/src`). Client follow-up already tracked, not a new ticket — `CLIENT-SESSION-25`'s own Delta
section (filed 2026-09-21) had already anticipated this exact endpoint and flagged checking whether
it landed; updated that ticket's Delta with the shipped contract (endpoint path, response shape,
the `locationId`-is-multi-value/`sportId`-stays-single-value distinction) rather than filing a
redundant second ticket for the same follow-up.

**Tests:**
- `SessionServiceImplSpec` — 9 new cases covering the date-list resolution (default window,
  explicit dates sorted/deduped, past-date silent drop, all-past→empty), the two zero-count
  backfill short-circuits (inactive `sportId`, zero profiles), backfill of a missing query row,
  `locationIds`/`hasLocationIds` wiring, and invalid `viewerZoneId`. Green (module suite).
- New `SessionDiscoverDateCountsIntegrationTest` (`server/src/test/java/.../integration/`) — 10
  real `MockMvc`+H2 cases: default window + backfill, explicit dates + past-date drop, all-past
  empty result, >8 dates → 400, `date==today` floor excluding an already-started session,
  `isPublic` gating, multi-value `locationId` OR-combination, inactive `sportId`, default status
  list (excludes `ONGOING`/`CANCELLED`/`COMPLETED`), caller-exclusion baseline. Green.
- Full `:server:test`: green, 1m48s (consistent with the documented ~1m41s clean-state baseline,
  no new failures).

## Post-completion addendum (2026-09-22, same session, user-directed)

Two follow-up changes made after this ticket's own implementation summary above, in the same
session/branch:

1. **`isPublic` gate test strengthened, both here and in the pre-existing `SessionDiscoverIntegrationTest`
   (SESSION-37).** The original `isPublicFilter_excludesAGroupLinkedSession` test only proved a
   *private* group-linked session is excluded — it didn't prove the gate is genuinely `is_public`
   rather than `group_id IS NULL` (today's two conditions happen to coincide, since nothing sets
   `isPublic = true` on a group-linked session yet — see `Session.isPublic`'s own Javadoc: "a group
   session becoming independently public is a real future feature, not built here"). Renamed to
   `isPublicFilter_excludes...ButIncludes...PublicGroupLinkedSession` in both files and added a
   fixture with `groupId` set **and** `isPublic = true` (not reachable via any real API path today,
   built directly via the repository as a fixture) — proves the query is future-proof against that
   feature landing without silently starting to exclude those sessions too.
2. **`/discover`'s own `locationId` widened from single-value to multi-value, OR-combined** — for
   parity with this ticket's own `locationId`, once the user pointed out the two endpoints'
   contracts had diverged. `SessionRepository.findDiscoverSessions` (JPQL) gained the same
   `hasLocationIds`/`locationIds` boolean-flag-plus-sentinel shape `findDiscoverDateCounts`
   (native) already used, for the same reason (no proven-safe precedent for binding a null `List`
   to `IN (:param)`). Consumer census: no other backend module calls `discoverSessions`; the
   client's `useDiscoverSessions.ts` doesn't send `locationId` at all today, and the MSW handler
   for `/api/sessions/discover` doesn't filter by it either — both compatible as-is, nothing to
   update. Existing backend tests updated: `SessionServiceImplSpec`'s `locationId`-forwarding case
   (now `[5L]`/`hasLocationIds=true`) plus two new cases (omitted → sentinel/`false`, multiple
   values → `true`); `SessionDiscoverIntegrationTest.locationIdFilter_exactMatchOnly` renamed to
   `_singleValueIsExactMatch` (behavior unchanged, single value still exact-matches) plus a new
   `_multipleValuesAreOrCombined` case. Green: `session-impl` (full Spock suite) + both discover IT
   classes in isolation (47 tests) + full `:server:test`.

---

🤖 Generated with [Claude Code](https://claude.com/claude-code)
