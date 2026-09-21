# SESSION-37 · `isPublic` + index redesign, `/discover`'s `date`/`startTimeFilter` final shape, drop `ONGOING`

**Status:** `IN PROGRESS`
**Type:** Enhancement
**Depends on:** SESSION-35 (`DONE`) — changes the exact `date` semantics that ticket just shipped
**Filed:** 2026-09-18, user request following SESSION-35's implementation and merge — a real
follow-up refinement to the `date`-required contract SESSION-35 just introduced, not a bug in it.

SESSION-35 made `/discover`'s `date` a required param matching *exactly* one calendar day
(`[dayStart, dayEnd)`). This ticket changes `date` from an exact-day match into an **inclusive
lower bound** — sessions from `date` onward, open-ended (no end date), paginated the normal
`page`/`size` way (the client calls `loadMore()` for the next page until it runs out of sessions).
`date` stays required (SESSION-35's requirement itself isn't reversed), but a single request can
now surface sessions across many days, not just one — much closer to the pre-SESSION-25 "browse
upcoming sessions" behavior, just with an explicit, caller-chosen starting point instead of an
implicit `now()`.

**Who/entry point:** Normal User, via `GET /api/sessions/discover` (Matches page's Discover panel
and the rail-triggered Discover modal, both CLIENT-SESSION-6 — this backend change is also the
likely fix for **CLIENT-SESSION-25**'s stopgap "today only" narrowing, since `date=today` under
this new model returns everything from today forward, not just today; worth re-checking
CLIENT-SESSION-25's scope once this ships, not decided here).

## Scope

1. **`status`: drop `ONGOING` from discoverable sessions.**
   - `ONGOING` is no longer part of the default status list (currently
     `PREPARING`/`SCHEDULED`/`ONGOING` → becomes `PREPARING`/`SCHEDULED`).
   - An explicit `status` list containing `ONGOING` does **not** 400 — `ONGOING` is silently
     stripped out of the list instead (never a validation error for this specific value, unlike a
     genuinely invalid one like `CANCELLED`, which still 400s).
   - If stripping `ONGOING` empties the list entirely (e.g. `status=ONGOING` alone), treat it the
     same as `status` being omitted — fall back to the default list (`PREPARING`/`SCHEDULED`), not
     an empty result.

2. **`date` becomes an inclusive lower bound, not an exact-day match.**
   - `scheduledStart >= <resolved instant for date>`, no upper bound — replaces SESSION-35's
     `[dayStart, dayEnd)` range entirely.
   - Still a required param (SESSION-35's requirement stands) — just no longer restricts to one day.
   - Normal pagination (`page`/`size`, the existing `Pageable`) — the client's "load more" pages
     forward through the open-ended result set exactly like every other listing endpoint already
     does, not a new response shape.

3. **Smart default time floor when `startTimeFilter`/`startTime` are omitted** (only applies when
   the caller doesn't explicitly set them — an explicit `startTimeFilter`/`startTime` still
   overrides, same optional-pair contract as today):
   - `date` resolves to **today** (in the resolved `viewerZoneId`, falling back to UTC per
     SESSION-35) → floor = the current server instant (`now()`, computed against the caller's
     resolved zone then compared as the same UTC instant already used everywhere else) — excludes
     sessions that already started earlier today.
   - `date` resolves to **any other day** (necessarily a future day, since `date` is a lower bound)
     → floor = `date`'s own start-of-day (00:00) — i.e. no additional restriction beyond the
     `date` bound itself for that first day.

## Open questions — resolve at pickup, don't guess

- **Exact interaction between the new implicit floor and an explicit `startTimeFilter`/`startTime`
  across an open-ended, multi-day result set.** Previously (SESSION-35, single exact day),
  `startTimeFilter` only ever needed to mean "this time-of-day, on this one day." Now that a
  request can span many days, does an explicit `startTimeFilter` mean "this time-of-day, every day
  in the open-ended range" (reverting to the pre-SESSION-35 semantics `startTimeFilter` originally
  had) — or something narrower? Needs a real decision before implementing, not assumed.
- Sort order interaction: the existing 3-level sort (`scheduledStart ASC`, open slots `ASC`,
  `createdAt ASC`) presumably still applies unchanged across the open-ended range, but confirm at
  pickup rather than assume, given how much else about `date` is changing.

## Scope change (2026-09-19) — supersedes the original "inclusive lower bound" design above

User request at pickup: redefine `/discover`'s request payload shape for
`date`/`startTimeFilter`/`startTime`. Every other param (`sportId`, `title`, `locationId`,
`minOpenSlots`, `feeType`, `maxFeeAmountVnd`, `viewerZoneId`, `status`, including the `status`
default dropping `ONGOING` per scope item 1 above) is unchanged.

**This replaces scope items 2 and 3 above** (the "`date` is a single required lower bound" /
"smart today-vs-future floor on one date" design) — `date` is no longer a single value at all, so
those two bullets no longer apply as written. Item 1 (drop `ONGOING`) stands unmodified.

### Resolved design

| Param | Today | New |
|---|---|---|
| `date` | `LocalDate`, required | `List<LocalDate>`, **optional** |
| `startTimeFilter` | optional, must be paired with `startTime` | optional, independently |
| `startTime` | optional, must be paired with `startTimeFilter` | optional, independently |

**`date` (list, optional) — exact-day OR-match, not a range:**
- Each date in the list is evaluated independently against "today" (in the resolved
  `viewerZoneId`, falling back to UTC). A date `< today` is silently dropped — never a 400.
- A survivable date `d` contributes its own inclusive window: `d == today` → `[now(), dayEnd(d))`
  (excludes sessions already started today); `d > today` → `[dayStart(d), dayEnd(d))`. A session
  matches if it falls in *any* survivable date's window (OR-combined across the list).
- If the list is omitted, empty, or every date in it is in the past (nothing survives) → **default
  discover case**: no date restriction at all beyond `scheduledStart >= now()`, open-ended,
  standard pagination. This is the "just browse everything upcoming" path — the client's default
  flow (see Client impact below) uses this by omitting `date` entirely, not by sending `date=today`.

**`startTimeFilter`/`startTime` — no longer a strict pair:**
- Both given → unchanged from today (time-of-day comparison in the given direction).
- `startTime` given, `startTimeFilter` omitted → defaults to `AFTER_OR_EQUAL`.
- `startTimeFilter` given, `startTime` omitted → silently ignored, same as if neither were given
  (no 400 — the existing "must be given together" 400 check is removed).
- Neither given → no time-of-day filter, same as today.
- Still date-agnostic/per-row (existing `EXTRACT`+`MOD` mechanism) — AND-combines with whichever
  date windows are in play (every survivable date, or the open-ended default case).

### Resolved (former Part B — still-open decisions from the original scope)

1. **startTimeFilter's multi-day meaning:** time-of-day, applies across every window in play
   (every survivable date, or the whole open-ended default-case range) — no query-logic change
   needed, the existing per-row `EXTRACT`+`MOD` clause is already date-agnostic.
2. **Sort order:** unchanged — `scheduledStart ASC`, then open slots `ASC`, then `createdAt ASC`,
   across whichever rows survive the (possibly multi-window) filter.
3. **Past `date` handling:** resolved above — silently dropped per-date, not a 400.

### Client impact (flagged, not built here)

Client's `useDiscoverSessions.ts` currently always sends `date=<today>` (SESSION-35's required-param
workaround). Under exact-day semantics that would now mean "only today," the opposite of the
open-ended browse this ticket wants. The client needs to switch to **omitting `date` entirely** for
its default "browse upcoming" flow, reserving an explicit `date` list for a future date-picker/
multi-select (already tracked as **CLIENT-SESSION-27**). File this as a client backlog follow-up
ticket before closing this ticket — do not leave it only noted here (CLAUDE.md § API Change
Discipline).

No new filter/search scenarios beyond the above were requested.

### Open implementation concern — query strategy for the `date` list (RESOLVED below, see 2026-09-21)

~~Querying an OR of N independently-survivable date windows doesn't fit the shipped
`findDiscoverSessions`'s static JPQL shape...~~ **Resolved by splitting scope — see the final
decision section below.** The `List<LocalDate>`/multi-date-OR design this concern was about no
longer belongs to `/discover` at all; it moved to a new, separate ticket (**SESSION-39**). Full
exploration trail (every query shape tried, real `EXPLAIN ANALYZE` evidence, the range/multirange
and JOIN alternatives that were tried and didn't win) stays in
`documentation/md/adr/DISCOVER_SCHEDULED_START_FILTER_ADR.md` — that ADR's own status is now
"Decided," not superseded by this note.

---

## Final decision (2026-09-21) — supersedes every `date`/`startTimeFilter` design above

User made the final call after the ADR's performance investigation (real `EXPLAIN ANALYZE` evidence,
`documentation/md/adr/DISCOVER_SCHEDULED_START_FILTER_ADR.md`). **This is the design to implement.**
Everything above this section is historical trail (kept per this repo's documentation convention),
not the current scope.

**The core change in direction: `/discover` goes back to a single required `date` (closer to
SESSION-35's original shape, plus a smart floor) — the "browse many days at once" job that motivated
this ticket's original redesign is now served by a *separate* new endpoint, `SessionCount`
(**SESSION-39**), not by `/discover` itself.** `/discover` stays a single-day drill-down; `SessionCount`
gives the date-section overview a real UI would use to decide which day to drill into. This split
also resolves the ADR's §4c/§4d deadlock (caching's caller-specific-filtering problem, and the
bounded-default-window visibility-gap objection) by simply not needing either: `SessionCount` is a
live, fully-filtered query (no cache, so no caller-specific-filtering problem) with a small, capped
default window (no unbounded cache-growth or query-cost concern either).

### 1. New `Session.isPublic` column (foundational, shared with SESSION-39)

- New `boolean` column, **not derived at query time from `groupId`** — a real stored column.
  - `createSession`: `isPublic = (groupId == null)` — standalone → `true`, group-linked → `false`.
    Not caller-supplied (not part of `CreateSessionRequest`) — fully derived at creation.
  - Migration: 3-step (add nullable → backfill `UPDATE sessions SET is_public = (group_id IS NULL)`
    → `ALTER COLUMN is_public SET NOT NULL`), standard pattern for a `NOT NULL` column added to an
    existing table.
  - **Open question, resolve at pickup:** expose `isPublic` on `SessionResponse`? Not requested
    either way — lean toward yes (cheap, and both new/changed endpoints conceptually deal with
    "public sessions"), but don't decide unilaterally here.
  - **Explicitly out of scope:** no way to change `isPublic` after creation via `updateSession` — a
    group session becoming independently "public" (diverging from `groupId == null`) is a real
    future feature, not this ticket's.

### 2. Index redesign — user's proposal, corrected against real consumers

User proposed two partial indexes and asked for correction if wrong. Verified against every actual
consumer before finalizing:

**Index (a), corrected:** `(sport_id, status, scheduled_start) WHERE is_public = true` — **not**
`(sport_id, is_public, scheduled_start)` as originally proposed. `is_public` should not also be an
indexed *column* — the partial predicate already guarantees every row in this index has
`is_public = true`, so indexing it again as a column gives the planner no new information and just
wastes space. This is a predicate swap on the *existing* `idx_sessions_sport_id_standalone`
(currently `WHERE group_id IS NULL`) — same column list, new predicate. Requires drop+recreate
(Postgres can't alter a partial index's predicate in place).

**Index (b), as proposed (`(scheduled_start) WHERE status IN ('SCHEDULED','PREPARING')`) — dropped
from scope, verified not to earn its keep.** Checked both real consumers of the *existing* narrow
partial index (`idx_sessions_scheduled_status_only`, `WHERE status = 'SCHEDULED'`, SESSION-12):
- `findSessionsToStart` (`SCHEDULED`→`ONGOING` transition): `status = 'SCHEDULED'` only.
- `findUnpreparedSessionsToCancel`/`cancelUnpreparedSessions`: `status = 'PREPARING'` only.

Neither needs both statuses in one predicate — each is genuinely single-status. Widening the
existing index to `IN ('SCHEDULED','PREPARING')` would bloat it for these consumers with zero
benefit to either. A brand-new, separately-scoped `(scheduled_start) WHERE status IN (...)` index
doesn't have a real consumer either: Discover and `SessionCount` (SESSION-39) both always scope by
`sport_id`+`is_public` first (never a bare status+date query), so index (a)'s replacement — which
already carries `status` as an indexed column, same shape as today — covers them. **Recommendation:
implement only the index (a) predicate swap; leave `idx_sessions_scheduled_status_only` untouched;
do not add a second new index unless a real query shape without sport/`is_public` scoping shows up
later.**

### 3. `/discover` final request shape

| Param | Shape |
|---|---|
| `date` | `LocalDate`, **required** (reverts the `List<LocalDate>`/optional design from the 2026-09-19 section above — that shape now belongs to SESSION-39 instead) |
| `startTimeFilter` | optional, independently (not paired with `startTime`) — unchanged from the 2026-09-19 resolution |
| `startTime` | optional, independently — unchanged |
| `status` | unchanged — default drops `ONGOING` (scope item 1, top of this doc), explicit `ONGOING` silently stripped, other invalid values still 400 |
| everything else (`sportId`, `title`, `locationId`, `minOpenSlots`, `feeType`, `maxFeeAmountVnd`, `viewerZoneId`) | unchanged |

**`date`'s time range (replaces every earlier lower-bound/list design):**
- `date < today` (past) → **silently clamp to today's semantics** (not a 400, not "ignored" in the
  sense of dropping the param — treated exactly as if `date == today` had been sent).
- `date == today` → `[now(), dayEnd(today))`.
- `date > today` (future) → `[dayStart(date), dayEnd(date))`.
- All boundaries computed in the resolved `viewerZoneId` (falls back to UTC), same `resolveZone`
  pattern already used everywhere in this module — computed once in Java as plain `Instant`
  parameters (never a per-row `AT TIME ZONE` on the query column — see the ADR's §0b for exactly
  why that distinction matters for index usability).

**`startTimeFilter`/`startTime` combine with the date's time range exactly the way `startTime` has
always combined with `date`** — AND-combined, via the existing per-row `EXTRACT`+`MOD` mechanism
(unchanged, still date-agnostic).

**Query base change:** `findDiscoverSessions`'s `s.groupId IS NULL` condition becomes
`s.isPublic = true` (§1's new column), matching the index redesign in §2.

**Pagination:** page size default changes from the current `20` to **`10`** — explicit, stated
change, not the existing `@PageableDefault(size = 20)`. Client "load more" pattern unchanged
(standard `page`/`size`, no new response shape).

### 4. Client impact (flagged, not built here)

With `/discover` back to a single required `date`, **CLIENT-SESSION-25** (`client/docs/MVP/
CLIENT-SESSION-25_DISCOVER_DATE_PICKER.md`, `TODO`) is still the right client ticket — its own scope
(single-day picker, next/prev, explicitly *not* a multi-date/calendar view) already matches this
final design exactly, no client-side scope change needed there beyond what it already describes.
**Correction:** earlier sections of this doc referenced a "CLIENT-SESSION-27" as the eventual
multi-date-picker follow-up — that ticket was **never actually filed** (checked
`client/docs/BACKLOG_MVP.md` directly), only mentioned in prose, which per CLAUDE.md's API Change
Discipline doesn't count as filed. Moot now anyway — the multi-date-list shape it would have served
no longer belongs to `/discover` (it's SESSION-39's `SessionCount` now), so no such client ticket is
needed. Don't create one referencing the old "CLIENT-SESSION-27" name.

A small delta is worth adding to CLIENT-SESSION-25 itself (not a scope change, just new context):
once SESSION-39 ships, its date-section-overview data could enhance CLIENT-SESSION-25's picker
beyond a bare next/prev control — flagged there, not decided here.

---

## Out of scope

Any change to `/upcoming`'s or `/history`'s `date` params (both SESSION-35's own scope, both stay
an exact single-day match) — this ticket is `/discover`-only. Reversing SESSION-35's
"`date` is required" decision itself — that stays required, only its exact-day-vs-lower-bound
shape changes. **The `SessionCount` endpoint itself (date-list, per-day counts) — filed separately
as SESSION-39, which depends on this ticket for `isPublic` + the index redesign (§1/§2 above).**
The `getSession` single-item visibility gap found while scoping this ticket (no membership/
participant check at all on `GET /api/sessions/{sessionId}`, unlike `getGroupSessions`'s list-level
gate) — unrelated to this ticket's actual scope, filed separately as **SESSION-40**.

---

🤖 Generated with [Claude Code](https://claude.com/claude-code)
