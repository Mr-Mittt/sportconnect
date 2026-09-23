# CLIENT-SESSION-29 · Complete the Discover session feature

**Status:** `TODO`
**Type:** Client feature
**Depends on:** none
**Filed:** 2026-09-23, user request while reviewing the open `/list client mvp` queue — rounds out
CLIENT-SESSION-22's Discover work with the remaining filter/UX gaps and a real modal-specific bug
found live that session. Inserted ahead of CLIENT-SESSION-23 in the queue (user decision).
**Supersedes CLIENT-SESSION-28** (`DiscoverLocationFilter`'s search-input-can't-be-typed-into bug)
— moot once this ticket's Location filter redesign removes the search box the bug lives in.

## Scope

1. **Location filter redesign** — drop the current freeform search box; add a "Choose a location"
   flow reusing the same `LocationPicker` component `CreateSessionModal` already uses. Once a
   location is chosen, it appears as a new checkable row in the filter's list (alongside any
   favorited locations already shown) — same "picked item joins the list" precedent
   `DiscoverDatePicker`'s "Pick a date…" calendar flow already established for custom dates.
   - **Question to resolve at pickup:** does this apply to both Discover surfaces (the full
     `/matches` page panel and the rail's `SessionDiscoverModal`), or just one? Not specified at
     filing.
   - **Question to resolve at pickup:** does the existing favorites checklist stay alongside
     "Choose a location", or does "Choose a location" replace it entirely?

2. **Date option label format** — checklist rows (and the equivalent quick-pick in
   `CreateSessionModal`'s own date picker, `SessionStartTimePicker`) switch from the current
   `dd/MM` format to `<weekday-abbrev>, <ordinal-day> <month-abbrev>` (e.g. "Thu, 15th Oct") for
   any date beyond tomorrow. **Today** stays bare `"Today"`. **Tomorrow** becomes
   `"Tomorrow (15th Oct)"` — same ordinal-day/month-abbrev styling, keeping the word "Tomorrow"
   instead of the weekday. Changes `discoverDateLabel.ts`'s `formatDiscoverDateLabel`/
   `formatDiscoverDateOptionLabel` — needs date-fns's ordinal token (`do`) plus a weekday+month
   format string.

3. **New Discover filters**: status, open slot count (`minOpenSlots`), fee (`feeType`/
   `maxFeeAmountVnd`) — all three already exist as real, working `GET /api/sessions/discover`
   query params (see `session-impl`'s own `CLAUDE.md` endpoint list); this is purely client-side
   filter UI wiring, no backend dependency. Applies to both Discover surfaces (the `/matches` page
   panel and the modal).
   - **Question to resolve at pickup:** the filing conversation included the fragment "above today
     result", which was never fully clarified before filing — re-confirm with the user what this
     means before finalizing the filter UI; may be nothing, may be a real requirement about
     filtering across non-today dates specifically.
   - Duration filter explicitly dropped from scope (no backend support exists for it today — would
     be a new cross-module dependency on `session-impl`, out of scope for this ticket).

4. **New "Requested sessions" section** on the `/matches` page, backed by
   `GET /api/sessions/requested` (backend SESSION-42, `DONE`, already shipped — zero existing
   client callers today, confirmed via a full codebase search at filing time). Renders
   always-expanded (not collapsible), alongside the existing "My sessions" panel (or its
   CLIENT-SESSION-23 Upcoming/History replacement, whichever has landed by pickup time).

5. **Bug fix — Discover modal's Time filter doesn't auto-apply on hour/minute edit.** In
   `SessionDiscoverModal` specifically (confirmed at filing that `SessionDiscoverPanel`/the
   `/matches` page works correctly), editing the Hour/Minute number inputs in
   `DiscoverTimeFilter`'s popover doesn't update the result list or the trigger's own label — only
   clicking Before/After applies the change. Root cause not yet investigated; since the same
   `DiscoverTimeFilter` component backs both surfaces, the bug is more likely in how
   `SessionDiscoverModal`'s own data hook (`useDiscoverModalFilters`/`useDiscoverModalData`) wires
   the `onStartTimeChange` callback than in the shared component itself — start there at pickup.

**Who:** Normal User, on the `/matches` page and the rail's "Join a match" modal (Home Feed/
Groups/Friends/Profile).

**Entry point:** `/matches` page's Discover panel and "My sessions"/"Requested sessions" area; the
rail's `SessionDiscoverModal`.

**Inputs/outputs:** New filter UI state (status/open-slot/fee selections) feeding existing
`/discover` query params; a new `GET /api/sessions/requested` data hook and section component; a
new date-label formatting function; a `LocationPicker`-based flow replacing the location search
box.

**Edge cases:**
- Zero requested sessions — the new section needs its own empty state (does "always-expanded" mean
  it's always visible even at zero, or hidden when empty? **Question to resolve at pickup.**)
- A location chosen via "Choose a location" that's already in the checklist (e.g. already
  favorited) — dedupe, or is a duplicate-looking row acceptable? **Question to resolve at pickup.**

**Out of scope:**
- Duration filter (dropped — no backend support, see Scope item 3).
- Any backend change — every filter this ticket wires already exists as a real `/discover` query
  param, and `/sessions/requested` already exists too.
- Redesigning `SessionCard` or the participation-action button (CLIENT-SESSION-23's own scope).

**Tests:** Vitest coverage for the new Location-picker-based filter flow, the new date-label format
(replacing `discoverDateLabel.test.ts`'s current `dd/MM` assertions), the three new filter controls
(status/open-slot/fee) on both Discover surfaces, the new "Requested sessions" section (empty +
populated states), and a regression test proving the Time filter's hour/minute auto-apply bug is
fixed specifically in `SessionDiscoverModal`. `matches-journey.spec.ts` e2e coverage for the new
filters and the Requested-sessions section; Storybook stories for the new Location-picker flow and
Requested-sessions section.

---

🤖 Generated with [Claude Code](https://claude.com/claude-code)
