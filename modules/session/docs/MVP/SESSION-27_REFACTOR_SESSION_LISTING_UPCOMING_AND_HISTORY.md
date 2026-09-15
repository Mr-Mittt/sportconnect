# SESSION-27 · Refactor session listing — replace /mine with /upcoming and /history

**Status:** `TODO`
**Type:** Enhancement (Architecture)
**Depends on:** none (informed by SESSION-24, which added `PREPARING` and exposed this gap)
**Filed:** 2026-09-15, found while verifying client `CLIENT-SESSION-21` (the `PREPARING` warning +
completion UI). `GET /api/sessions/mine` is standalone-only, so the client fans out a separate
`/joined` call plus one `/sessions/group/{id}` call per group and merges all three client-side
(`useMatchesPageData`, `useUpcomingMatches`) just to answer "what's coming up for me" — both of
those hooks' own doc comments already flag this as a real gap. That client-side merge also has no
`page`/`size` params against a default-`Pageable` (size 20, no `ORDER BY`) backend response, so a
caller with 20+ sessions silently loses anything past page 0 with no "load more" affordance —
observed live (a newly-created session, id 45, never appeared in "My sessions"). User requested a
proper `/upcoming` + `/history` split to replace `/mine` outright rather than patch around it.

## Scope

Replaces `GET /api/sessions/mine` (removed) with two new endpoints. All four routes below are
scoped by the caller's own **participant row**, not by who created the session — a group-linked
session is included exactly like a standalone one wherever a matching participant row exists.

1. **`GET /api/sessions/upcoming`** — every session (standalone or group-linked) where the caller
   currently has a participant row with status `JOINED` or `INVITED` (not `REQUESTED` — a pending
   request the caller hasn't been approved/accepted into yet doesn't belong in "upcoming"),
   restricted to `Session.status IN (PREPARING, SCHEDULED, ONGOING)`. This is the real replacement
   for today's client-side `mine` + `joined` + per-group fan-out merge — one call instead of
   `2 + groupCount`. **Sorted `scheduledStart ASC` (soonest first)** and **genuinely paginated** —
   real `Pageable` `page`/`size` params the client is expected to actually pass (this ticket exists
   specifically because the old `/mine` merge silently dropped anything past an implicit, unrequested
   page 0; the fix is real "load more" wired to real pagination, not a bigger default page size).
2. **`GET /api/sessions/upcoming?date=<date>`** — same participant/status filter (standalone or
   group-linked) and `scheduledStart ASC` sort, narrowed to `scheduledStart`'s calendar-date
   component matching `date`.
3. **`GET /api/sessions/history?date=<date>`** — every session, standalone or group-linked, where
   the caller has a `JOINED` participant row (not `INVITED` — an invite never accepted isn't "my
   history") and `Session.status IN (CANCELLED, COMPLETED)`, narrowed to `scheduledStart`'s
   calendar date matching `date`. **Sorted `scheduledStart DESC`** (matches
   `groupSessionsByDate.ts`'s existing history-zone convention: newest-within-the-day first).
   Paginated (real `page`/`size`).
4. **`GET /api/sessions/history?dateCount=<n>`** — **not** a session list or a single count.
   Returns the **last `n` distinct calendar dates** (most-recent-first) on which the caller has at
   least one such session (same standalone-or-group-linked, `JOINED` + `CANCELLED`/`COMPLETED`
   population as (3)), each annotated with its own per-date count:
   `{ "dates": [{ "date": "2026-09-14", "count": 2 }, ...], "hasMore": boolean }`. Optional
   `before=<date>` (exclusive) pages further back — the next `n` distinct history dates strictly
   older than `before` — so the client's own "load more" at the end of the date list keeps working
   without re-fetching dates it already has. **This is pagination over distinct dates, not over
   individual sessions** — a given date's own session list/count is fetched separately via (3) once
   the client expands that date.

`/history` takes **exactly one** of `date` or `dateCount` (`before` only ever accompanies
`dateCount`) — `date`+`dateCount` together, or neither, → 400.

**Who:** Normal User — replaces `useMySessions`'s role in `useMatchesPageData`/`useUpcomingMatches`.

**Entry point:** the four `GET` routes above on `SessionController`, same auth
(`@PreAuthorize("hasRole('USER')")` + `SecurityUtils.extractUserId`) as every other endpoint in
this controller.

**Backend census (done at filing):** `getSessionsCreatedByUser`/`GET /sessions/mine` has no other
Java caller anywhere in the monorepo (grepped) — removing it is backend-internal-safe. The only
real consumers are client-side; see the follow-up client ticket.

**Edge cases:**
- A session the caller *manages* via a group owner/admin role but has never personally joined —
  **not** included in `/upcoming` (same pre-existing gap `useMatchesPageData`'s own doc comment
  already flags: "There's still no batch sessions-across-my-groups-I-manage endpoint"). Not solved
  here — flagging so it isn't silently assumed fixed.
- `date`/`dateCount` with no matching rows → empty list / `{ "dates": [], "hasMore": false }`, not
  an error.
- `dateCount <= 0`, or a malformed `date`/`before` → 400.
- `before` present without `dateCount` → 400 (it's `dateCount`'s own paging cursor, not a
  standalone filter).
- Deactivated caller (`isActive = false`): no new authenticated endpoint pattern beyond what this
  controller already has — same accepted JWT-window gap (U12), not compounded here.

**Out of scope:**
- `/discover` and its search/filter work — **SESSION-25**/**SESSION-26**, unrelated endpoint.
- Group-owner/admin "sessions I manage but haven't joined" visibility — real gap, not this ticket.
- Client wiring — separate follow-up client ticket (filed alongside this one).
- `REQUESTED`-status visibility in `/upcoming` — deliberately excluded (see Scope).

**Tests:** Spock coverage for each endpoint: `/upcoming` with no `date` (mixed standalone +
group-linked, `JOINED` + `INVITED`, all three included statuses, `REQUESTED` excluded,
`scheduledStart ASC` sort, real pagination past the first page); `/upcoming?date` scoped to one
day; `/history?date` (`CANCELLED`/`COMPLETED`, `JOINED`-only, `INVITED` excluded, standalone +
group-linked, `scheduledStart DESC` sort, real pagination); `/history?dateCount` (correct distinct
dates + per-date counts, most-recent-first, `hasMore` true/false at the boundary, `before` cursor
returning strictly older dates with no overlap/gap against the prior page); 400 on
`date`+`dateCount` together or neither; 400 on `dateCount <= 0`; 400 on `before` without
`dateCount`; empty-result-not-error for all four; deactivated-caller not compounded.

---

🤖 Generated with [Claude Code](https://claude.com/claude-code)
