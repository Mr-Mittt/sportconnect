# CLIENT-SESSION-25 · Discover panel/modal needs a real date picker

**Status:** `SUPERSEDED` (2026-09-22, by CLIENT-SESSION-22)

**Superseded 2026-09-22 (user decision, at CLIENT-SESSION-22's pickup):** CLIENT-SESSION-22's scope
widened at pickup to build a multi-date select + per-date collapsible Discover sections, absorbing
this ticket's entire "real date picker" scope (including its `viewerZoneId`/SESSION-39 notes below)
rather than building it twice. See CLIENT-SESSION-22's own "Scope change (2026-09-22)" entry for
the actual design. No further action needed on this ticket.
**Type:** Client feature
**Depends on:** backend **SESSION-35** (`modules/session/docs/BACKLOG_MVP.md`, `DONE`) — made
`GET /api/sessions/discover`'s `date` param required. Should also pick up **CLIENT-SESSION-24**'s
`viewerZoneId` wiring for this endpoint (`TODO`) at the same time if that hasn't landed yet, so the
date picker's chosen date is evaluated in the browser's real zone rather than defaulting to UTC.
**Filed:** 2026-09-18, follow-up from SESSION-35's backend implementation. That ticket's consumer
census found `useDiscoverSessions.ts` (backing the Matches page's Discover panel and the
rail-triggered Discover modal, both CLIENT-SESSION-6) calling `/discover` with no `date` at all —
a general "browse every upcoming joinable session" view. Making `date` required broke that, so
SESSION-35 patched the hook to hardcode the browser's today as a stopgap (documented on the hook
itself) rather than leave the feature broken. That stopgap is a real, accepted regression: Discover
can no longer show a session scheduled for tomorrow or next week, and `startTimeFilter` (if ever
exposed in this UI) can no longer search "any day, just this time-of-day" — both real capabilities
the backend still supports per-request, just not reachable from today's UI. This ticket restores
them properly instead of leaving the hardcode in place indefinitely.

## Scope

- Add a date selector to the Discover panel (`MatchesPage`'s Discover section) and the Discover
  modal (`SessionDiscoverModal`, CLIENT-SESSION-7's rail entry point) — default to today, same as
  the current hardcode, so nothing regresses further; let the caller move forward (and back, within
  reason — exact bound TBD at pickup, e.g. "no earlier than today" vs. allowing past dates the way
  the backend itself permits) to browse other days.
- Wire the chosen date into `useDiscoverSessions` in place of the hardcoded
  `format(new Date(), 'yyyy-MM-dd')`, and include `sessionKeys.discover`'s existing date-keyed cache
  entry (already part of the key per SESSION-35's client change — just needs the real chosen value
  instead of always-today).
- If CLIENT-SESSION-24 has landed by pickup, send `viewerZoneId` (the browser's IANA zone) alongside
  the chosen `date` the same way that ticket wires it for `/history`. If not landed yet, this ticket
  can still ship with the date picker alone (still UTC-bucketed server-side, same as today) and pick
  up `viewerZoneId` as a small follow-on once CLIENT-SESSION-24 ships.
- Update `SessionDiscoverModal`/`MatchesPage` Storybook stories, component tests, and the
  `client/e2e/mocks/handlers/sessions.ts` `/api/sessions/discover` handler + `matches-journey.spec.ts`
  E2E flow as needed for the new date-selection UI.

## Out of scope

A multi-date range or calendar-grid browsing view — this ticket only restores single-day browsing
with a picker to change which day, not a new way to see several days at once. Exposing
`startTimeFilter`/`startTime` in this UI at all (not currently wired to any control) is also out of
scope unless picked up here as a natural pairing — flag it at pickup if it turns out cheap to include
alongside the date picker, otherwise leave for its own ticket.

## Delta (2026-09-21, not a scope change — new context worth knowing at pickup)

Backend **SESSION-39** (`modules/session/docs/MVP/SESSION-39_SESSION_COUNT_ENDPOINT.md`, `TODO`,
depends on **SESSION-37**) adds a new `SessionCount` endpoint returning per-date session counts
(today + next 7 days by default, or an explicit date list) — exactly the data a richer date picker
could use to show "which days actually have sessions" instead of a bare next/prev control with no
information about what's ahead. Not required for this ticket's own scope (the plain next/prev
picker still satisfies it), but worth checking whether `SessionCount` has landed by the time this is
picked up — using it from the start would avoid building a bare picker now and enhancing it later.

**Update (2026-09-22): SESSION-39 has now shipped** — `GET /api/sessions/discover/counts`
(`SessionDiscoverDateCountsResponse`, `{counts: [{date, count}]}`). Note two contract details that
differ from `/discover` itself, relevant when wiring this in: `locationId` is a **multi-value**
filter here (repeated param, OR-combined) unlike `/discover`'s single-value `locationId`; `sportId`
stays single-value, same as `/discover`. If picked up before CLIENT-SESSION-24 ships, omit
`viewerZoneId` (falls back to UTC) same as every other endpoint today.

---

🤖 Generated with [Claude Code](https://claude.com/claude-code)
