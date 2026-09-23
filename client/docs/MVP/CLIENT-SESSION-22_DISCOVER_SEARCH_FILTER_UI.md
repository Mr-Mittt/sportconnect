# CLIENT-SESSION-22 · Wire Discover search/filter UI to SESSION-25's backend contract

**Status:** `DONE` (2026-09-22)
**Type:** Client feature
**Depends on:** backend **SESSION-25** — hard, needs the query-param contract to build against.
**Filed:** 2026-09-14, companion to SESSION-25 — user explicitly asked for this as a separately
filed client ticket rather than a prose mention.

## Scope

1. Wire the currently-inert Date/Time/Location filter pills (from CLIENT-SESSION-6's design
   export, never wired — CLIENT-SESSION-7 only extracted the client-side title/location substring
   search) to SESSION-25's new server-side query params, on both the `/matches` Discover panel
   (`SessionDiscoverPanel`) and the "Join a match" modal (`SessionDiscoverModal`) — both already
   share `useDiscoverModalData`, so the new filter state/params belong there.
2. Replace the existing client-side substring title/location filter with the new server-side
   `title` param (still debounced client-side before firing the request); location moves from
   substring match to the new exact `locationId` filter pill.
3. Default filter state on load matches the server's new default (status: all 3, date/time:
   `now()`-forward) — per the user's explicit answer that the client mirrors the server's default.

**Out of scope:**
- SESSION-26's attribute filter UI — no backend yet.
- The `PREPARING`-status warning and completion UI — **CLIENT-SESSION-21**.
- Any new location-search or gear/equipment UI — still no such domain, per CLIENT-SESSION-6's
  original deferral.

**Tests:** Vitest for the new filter param wiring; MSW handler updates for the new `/discover`
query params; updated `matches-journey` e2e for at least one real filter.

## Scope change (2026-09-22, at pickup — user decision)

Filed 2026-09-14, one day before SESSION-25 shipped; the backend contract moved considerably
further in the week since (SESSION-35 made `date` a **required single day**, not the open
"now()-forward" range this ticket's original default-state bullet assumed; SESSION-39 added
`GET /api/sessions/discover/counts`; `locationId` was widened to multi-value on both endpoints
2026-09-22). Rather than wire the three original pills against a now-stale mental model, scope
widened to:

1. **Date pill** — reuses `SessionStartTimePicker`'s Today/Tomorrow/next-5-days dropdown pattern,
   but as a **multi-select** (checkbox list in the popover, same 7 quick options + "Pick a
   date…" calendar for anything further out, capped at 8 total selections to match
   `/discover/counts`' own cap). The **chronologically earliest** checked date is sent as
   `/discover`'s single required `date`; **all** checked dates are sent to `/discover/counts`
   (repeated `date` param). On initial load (before the user touches the pill), Today is the
   implicit single selection — `/discover/counts` runs with no `date` param (server's own
   today+7-days default window) and Today's section is pre-expanded, matching today's existing
   hardcoded-today behavior so nothing regresses further before the user picks anything.
2. **Results render as collapsible per-date sections** (new component, `SessionDateGroup`'s
   collapsed/expanded shell reused for the header, but each section owns its **own** lazy
   `/discover` query + independent load-more — unlike `SessionDateGroup`'s current "already have
   the flat list, just toggle visibility" shape), labeled `{date label} (count)` from the counts
   response. Only the pre-expanded default section (Today, or the earliest checked date once the
   user has made a selection) is un-collapsed by default; every other section is collapsed and
   fetches its own `/discover` call (single-date, all other active filters applied) the first time
   it's expanded, not before.
3. **Each date section supports its own "load more"** (`useInfiniteQuery`, same pattern
   `useSessionComments.ts` already uses; presentational "Load more" affordance same shape as
   `Feed.tsx`'s `hasMorePosts`/`onLoadMore`) — this **absorbs CLIENT-SESSION-26**'s scope (now
   marked `SUPERSEDED`, see that ticket's own entry) rather than building pagination twice.
4. **`viewerZoneId`** (the browser's IANA zone, `Intl.DateTimeFormat().resolvedOptions().timeZone`)
   is now sent on every `/discover` and `/discover/counts` call from this ticket, since SESSION-33/
   34/35 (the backend timezone chain) shipped since filing — **this absorbs the `/discover`-facing
   slice of CLIENT-SESSION-24's scope**; that ticket, when picked up, should skip `/discover` (and
   check `/discover/counts` isn't double-covered) and focus on `scheduledStart` submission +
   `/upcoming`/`/history`.
5. **Location pill** reverses this ticket's own original "no new location-search UI" framing —
   its popover offers **both** a checklist of the caller's favorite locations (`useFavoriteLocations`,
   CLIENT-SESSION-5) **and** a typeahead search box reusing `useLocationSearch`
   (`GET /api/locations/search`, already wired for `LocationPicker`/CLIENT-LOC-1) to find and add any
   other location by name. Each checked/added location becomes one `locationId` value in the
   repeated, OR-combined param — no new backend endpoint needed, both client hooks already exist.
6. This ticket now depends on backend **SESSION-39** (`modules/session/docs/BACKLOG_MVP.md`,
   `DONE` 2026-09-22, `GET /api/sessions/discover/counts`) in addition to SESSION-25.

**CLIENT-SESSION-25 and CLIENT-SESSION-26 marked `SUPERSEDED`** by this expanded scope (user
decision) — their designs (real date picker; load-more pagination) are both built here rather than
picked up separately later, same precedent as GRP-5→GRP-6.

**Out of scope (unchanged/reaffirmed):** SESSION-26's attribute filter UI (no backend yet); the
`PREPARING`-status warning/completion UI (CLIENT-SESSION-21); `minOpenSlots`/`feeType`/
`maxFeeAmountVnd` — no pill wires these, they stay unfiltered from the UI; Time pill's UI is a
simple Before/After direction + hour/minute select (reusing `SessionStartTimePicker`'s hour/minute
`<select>`s without its date piece), applied identically to every date section's own `/discover`
call (a global filter, not per-section).

## Implementation summary (2026-09-22)

**Design (approved Phase 3 plan, as built):**

- **Types:** `StartTimeFilter` added to `shared/types/session.ts` (mirrors backend's
  `BEFORE_OR_EQUAL`/`AFTER_OR_EQUAL`). New `DiscoverDateSection` type in `features/session/types.ts`
  (`date`, `label`, `count`, `isExpanded`, `sessions`, `isLoading`, `isError`, `hasMore`,
  `isFetchingMore`) replaces the old flat `sessions: SessionListItem[]` shape everywhere Discover
  results flow.
- **Data layer:**
  - `discoverParams.ts` — `DiscoverFilters` (the shared param set every `/discover`-family call
    sends), `buildDiscoverParams` (omits unset fields), `serializeDiscoverFilters` (stable cache-key
    serialization, sorts `locationIds`), `getViewerZoneId`.
  - `discoverDateLabel.ts` — `formatDiscoverDateLabel` (Today/Tomorrow/dd-MM, shared by the picker
    and every section header) and `discoverQuickDates`/`MAX_DISCOVER_DATES` (8, matching
    `/discover/counts`' own cap).
  - `hooks/useDiscoverDateCounts.ts` — wraps `GET /discover/counts`.
  - `hooks/useDiscoverDateSections.ts` — wraps `GET /discover` per date via a **fixed 8-call
    unrolled** `useDiscoverSectionQuery` (8 literal `useInfiniteQuery` calls, not a loop — the
    installed TanStack Query 5.101 has no `useInfiniteQueries`, and `useGroupSessionsForGroups`'s
    plain `useQueries` precedent doesn't cover infinite queries), each gated on `enabled: baseEnabled
    && date defined && expanded`. `toDiscoverSessionListItems`/`buildDiscoverDateSections` assemble
    the final per-date view model.
  - `queryKeys.ts` — `discoverCounts`/`discoverDate` builders, both still nested under
    `[...all, 'discover']` so `useAddSportProfile`'s existing broad invalidation keeps matching both
    without changes.
  - `useDiscoverFilters.ts` — the new composed hook (replaces `useDiscoverSessions` +
    `discoverSearch.ts`'s `filterDiscoverSessions`, both deleted), shared by `useMatchesPageData` and
    `useDiscoverModalData`. Owns search/date/location/time state, the 8-cap guard, the
    zero-date-selection guard (falls back to `[today]`), the "re-expand to new earliest date"
    behavior, and the sport-change location reset — all via the "adjust state during render"
    idiom (`useDebouncedValue`'s own precedent), **using `useState` for the previous-value
    comparison, not `useRef`**: this codebase's `react-hooks/refs` ESLint rule rejects
    reading/writing `ref.current` during render, which the first draft did and had to be reworked.
- **Components:** `DiscoverDatePicker`, `DiscoverLocationFilter`, `DiscoverTimeFilter` (all real
  Radix `Popover`s, not hand-rolled inline reveals — see the corrected design note below),
  `DiscoverDateSection` (collapsible section shell + `SessionCard` grid + load-more, all state
  passed in), and a rewritten `SessionDiscoverPanel` composing all four plus the existing search box.
- **Wiring:** `useMatchesPageData`/`useDiscoverModalData` spread `useDiscoverFilters`'s result;
  `MatchesPage.tsx` and all four `SessionDiscoverModal` render sites (`HomeFeedPage`, `GroupsPage`,
  `FriendsPage`, `ProfilePage`) updated to the new prop set.

**Design correction mid-session (before implementation started):** the original Phase 3 plan said
every new filter popover must be a hand-rolled inline reveal (no Radix `Popover`/`DropdownMenu`)
because `SessionDiscoverPanel` renders inside `SessionDiscoverModal`'s own Dialog, and
`SessionStartTimePicker`'s doc comment records that nesting broke live before. The user flagged this
as already solved. Checked `CreateSessionModal.tsx`'s `LocationFavoritesDropdown` (shipped *after*
that doc comment was written): a `DropdownMenu` nested in the same Dialog works with `modal={false}`
(Radix `DropdownMenu` defaults `modal=true`, which triggers the Dialog's own `hideOthers()` and
aria-hides it — `modal={false}` skips that, verified live). Separately, Radix `Popover` defaults
`modal=false` already (checked `node_modules/@radix-ui/react-popover`), so it was never affected by
this bug class at all. All three new filter pills use real `Popover`, not inline reveals — simpler
code, standard positioning/dismissal, no regression risk.

**Key decisions:** Location filter disabled entirely when the sport pill is "all" (both
`GET /locations/favorites` and `GET /locations/search` require one sport). `viewerZoneId` sent from
day one rather than waiting for CLIENT-SESSION-24 (that ticket's own file now has a Delta pointing
here). CLIENT-SESSION-25/26 marked `SUPERSEDED` rather than left open, since their designs are fully
built here (see "Scope change" above).

**Non-obvious constraint:** `useDiscoverDateSections`' 8-call unroll is deliberately verbose (`q0`
through `q7`) rather than a `.map()` loop — a loop calling a hook per iteration is a Rules-of-Hooks
violation this codebase's linter catches as a hard error, and 8 is a real, already-established cap
(`/discover/counts`' own `MAX_DISCOVER_COUNT_DATES`), not an arbitrary one.

## Testing

**Unit/component (Vitest):** 7 new test files — `discoverDateLabel.test.ts`, `discoverParams.test.ts`,
`useDiscoverFilters.test.tsx` (default state, 8-cap, zero-selection guard, re-expand-to-earliest,
sport-change location reset, debounced title param), `DiscoverDatePicker.test.tsx`,
`DiscoverLocationFilter.test.tsx`, `DiscoverTimeFilter.test.tsx`, `DiscoverDateSection.test.tsx`.
Updated: `SessionDiscoverPanel.test.tsx`/`.stories.tsx`, `SessionDiscoverModal.test.tsx`/`.stories.tsx`,
`useMatchesPageData.test.tsx` (2 tests rewritten off the removed client-side filter),
`MatchesPage.test.tsx` (3 tests fixed for the new per-section empty-state text and server-side
title filter), `useAddSportProfile.test.tsx` (query-key builder change). Full suite: **1373/1373
Vitest tests green, 187 files.** tsc/eslint clean (only pre-existing, unrelated warnings in
`SessionStartTimePicker.tsx`). Storybook build verified clean (new stories included).

**MSW handlers:** `e2e/mocks/handlers/sessions.ts` gained a shared `discoverableSessions()` helper
(filters by `sportId`/`title`/`locationId`, reused by `/discover` and the new
`GET /sessions/discover/counts` handler) — `date` itself stays unfiltered by this mock, matching its
pre-existing date-agnostic behavior (fixture sessions carry fixed `scheduledStart`s unrelated to
"today").

**E2E:** `matches-journey.spec.ts` step 10 rewritten for the server-side `title` filter (debounced,
new per-section empty-state text), new step 10b exercises the Date pill (check "Tomorrow", trigger
badge, new collapsed section header). `docs/E2E_OVERVIEW.md` updated (directory listing, preamble,
per-file test table). **`e2e` project: 81 passed / 2 failed (83 total)** —
`feed-groups-journey.spec.ts`'s deactivated-sport-nudge test and `friends-journey.spec.ts`'s
send-request test. Both **reproduced identically against a clean stashed `master`** (`git stash` →
re-ran each in isolation, `--workers=1` → same failure, same assertion, same line) — confirmed
pre-existing flakes unrelated to this change, not a regression. `visual-regression` project: no spec
exists for the Matches page's Discover panel (only `SessionDetailModal`/`CreateSessionModal` have
visual-regression coverage, from CLIENT-SESSION-12) — **not run**, since no baselined surface was
touched and there is nothing to regress against.

## Delta (2026-09-22, post-ship): modal simplification + Time filter redesign

Requested by the user immediately after the above shipped, on the same branch — not a separate
ticket. Four changes, all scoped to the Discover UI already built above:

1. **`DiscoverDatePicker`'s checklist rows now show Tomorrow's own date** (`Tomorrow (dd/MM)`),
   matching every other non-Today row; `Today` stays bare. New `formatDiscoverDateOptionLabel` in
   `discoverDateLabel.ts`, used only by the checklist row label (`dateOptionLabel` prop, renamed
   from `dateLabel` on `DiscoverDatePicker`/`SessionDiscoverPanel`). Section headers
   (`DiscoverDateSection`) keep the bare `formatDiscoverDateLabel` — "Tomorrow" stays unadorned
   there since the section itself already carries the date context a checkbox list doesn't have.
2. **`SessionDiscoverModal` (the rail's "Join a match" entry point) simplified to today-only**,
   title changed to "Discover today session". No `/discover/counts` call, no date sections, no Date
   filter pill — just a flat list of today's sessions with `loadMore()`. The full `/matches` page's
   own `SessionDiscoverPanel` is unchanged (still the full multi-date experience) — this split is
   modal-specific, since the rail modal's job is "join something happening today," not full
   discovery. New `useDiscoverModalFilters` hook (wraps the extracted `useDiscoverBaseFilters` +
   new `hooks/useDiscoverTodaySessions.ts`, a single flat `useInfiniteQuery` reusing
   `fetchDiscoverPage`/`toDiscoverSessionListItems` exported from `useDiscoverDateSections.ts`) sits
   alongside the full-page `useDiscoverFilters`, sharing everything except the date/counts/sections
   piece. Extracted `DiscoverSearchBox`/`DiscoverResultsList` so both the panel and the modal render
   the same search box and results grid/load-more/empty/error states rather than duplicating them.
3. **`DiscoverTimeFilter` trigger label**: `"Time"` (unset) stays as-is; set now reads
   `"Start before/after {time}"` (was `"Time: Before {time}"`).
4. **`DiscoverTimeFilter` popover redesigned to a horizontal row**: `[Before] [Hour] [Minute]
   [After]`. Before/After are now the filter's actual on/off toggle (mutually exclusive — clicking
   the already-active one clears the filter entirely, same as the old separate "Clear" link did),
   not a direction picker paired with a separately-committed time. Hour/Minute are 24h-validated
   number inputs (clamped 0-23/0-59 on blur), pre-filled with `now()` the first time the popover
   opens with no filter set.
5. **New footer on `SessionDiscoverModal`**: bottom-right "Find session for another date?" +
   "Discover more" button, navigating to `/matches` (`useNavigate`) and closing the modal — the
   escape hatch for a caller who wants the full multi-date panel the modal itself no longer shows.

**New/changed files:** `useDiscoverBaseFilters.ts` (search/location/time state extracted out of
`useDiscoverFilters.ts`), `useDiscoverModalFilters.ts`, `hooks/useDiscoverTodaySessions.ts`,
`components/DiscoverSearchBox.tsx`, `components/DiscoverResultsList.tsx` (new); `DiscoverTimeFilter.tsx`
(full redesign), `discoverDateLabel.ts` (+`formatDiscoverDateOptionLabel`), `DiscoverDatePicker.tsx`
(prop rename), `useDiscoverDateSections.ts` (`PAGE_SIZE`→exported `DISCOVER_PAGE_SIZE`,
`DiscoverSectionQuery`/`fetchDiscoverPage` exported for reuse), `useDiscoverFilters.ts` (now built
on `useDiscoverBaseFilters`, adds `dateOptionLabel`), `useDiscoverModalData.ts` (now calls
`useDiscoverModalFilters`), `DiscoverDateSection.tsx` (body delegates to `DiscoverResultsList`),
`SessionDiscoverPanel.tsx` (uses `DiscoverSearchBox`, `dateOptionLabel` prop),
`SessionDiscoverModal.tsx` (full rewrite — flat session list props, no date/counts props, new
footer), `MatchesPage.tsx` + `HomeFeedPage.tsx`/`GroupsPage.tsx`/`FriendsPage.tsx`/`ProfilePage.tsx`
(prop wiring for the above).

**Root cause of a same-round test regression, fixed in this delta:** `DiscoverTimeFilter.test.tsx`'s
"pre-fills with current time" test combined `userEvent.click()` with `vi.useFakeTimers()` —
`userEvent`'s internal interaction delays are real `setTimeout` calls that never resolve under fake
timers, so the click hung until the 5000ms test timeout. Because the hang happened before the
test's own `vi.useRealTimers()` cleanup ran, fake-timer state leaked into every later test in the
file, cascading into 8 of 9 tests failing. Fixed by using `fireEvent.click` instead (this codebase's
existing convention for fake-timer tests — see `FriendChatPanelView.test.tsx`'s typing-indicator
test), plus a file-level `afterEach(() => vi.useRealTimers())` safety net so a future hang can't
cascade the same way. Also fixed a real test bug in the "clicking After" test (asserted a hardcoded
minute `'00'` while only setting the hour input, leaving the real current minute in place).

**Testing (delta):** `discoverDateLabel.test.ts` (+3 cases for `formatDiscoverDateOptionLabel`),
`DiscoverTimeFilter.test.tsx` (rewritten for the new label/layout, 9 tests),
`SessionDiscoverModal.test.tsx`/`.stories.tsx` (rewritten for the flat-session shape, title, no Date
pill, load-more, "Discover more" navigation — new `MemoryRouter`/`createMemoryRouter` decorator,
same precedent as `CreatePostForm.stories.tsx`/`.test.tsx`), `SessionDiscoverPanel.test.tsx`/
`.stories.tsx` + `DiscoverDatePicker.test.tsx`/`.stories.tsx` (`dateLabel`→`dateOptionLabel` prop
rename). `HomeFeedPage.test.tsx`/`FriendsPage.test.tsx` updated for the modal's new dialog title.
**Full suite: 187/187 files, 1383/1383 Vitest tests green.** tsc/eslint clean (same 2 pre-existing,
unrelated warnings in `SessionStartTimePicker.tsx`). `e2e` project re-run: **82 passed / 1 failed
(83 total)** — `feed-groups-journey.spec.ts`'s deactivated-sport-nudge test, re-confirmed as a
pre-existing flake unrelated to this change (reproduced identically against a clean stashed
`master`, `--workers=1`, same assertion/line). `matches-journey.spec.ts` step 10b's checkbox
selectors updated for the new "Tomorrow (dd/MM)" accessible name.

## Delta 2 (2026-09-22, same day): `DiscoverTimeFilter`'s Before/After buttons unclickable in `SessionDiscoverModal` — real bug, root-caused and fixed

User report: "Before"/"After" appeared unselectable when opened from the rail's "Join a match"
modal. Reproduced live via Playwright against Storybook (browser extension unavailable this
session) and confirmed a genuine bug, not a misunderstanding — Storybook's own static/no-op `args`
pattern (used by every filter-pill story here, e.g. `DiscoverLocationFilter.stories.tsx`) was ruled
out first as a red herring by testing a stateful wrapper.

**Root cause:** a *modal* `Dialog` (`@radix-ui/react-dialog`, default `modal=true`) sets
`pointer-events: none` on `<body>` while open and restores `auto` only on its own Content node
(confirmed via `getComputedStyle` on the live DOM chain). `Popover`'s content
(`shared/ui/popover.tsx`) portals to `document.body` — a *sibling* of that Content node, not a
descendant — so it inherited `none`: visually on top (confirmed `data-state="open"`, correct
floating-ui position), but every click passed straight through to whatever `Dialog` content sat
underneath (a `SessionCard` title in the results grid, confirmed via
`document.elementFromPoint`). This directly contradicts this ticket's own earlier design note
("Radix `Popover` defaults `modal=false`... never affected by this bug class at all") — that
conclusion was drawn from reading the prop default, not from a live click test inside the actual
Dialog; it was right about Popover's own modal focus-trap not conflicting, but missed this
separate, `Dialog`-side pointer-events lock.

**Fix:** `shared/ui/popover.tsx` — `pointer-events-auto` added to `PopoverContent`'s className.
Minimal, at the shared primitive (not a one-off patch on `DiscoverTimeFilter`), so it also fixes
`DiscoverLocationFilter` in the same modal (confirmed broken with the identical symptom before the
fix, confirmed fixed after — both filters use the same `Popover`). Verified end-to-end with a
temporary stateful Storybook story (added, verified, removed): clicking "Before" now correctly
flips `aria-pressed` and updates the trigger label to `"Start before HH:MM"`.

**New regression coverage** (jsdom structurally cannot catch this class of bug — confirmed: a jsdom
test of `DiscoverTimeFilter` nested in a real `Dialog` couldn't even get the popover to report
`open` reliably, let alone reproduce real CSS pointer-events cascade): new e2e test in
`e2e/flows/home-feed-journey.spec.ts` ("the 'Join a match' modal's Time filter popover is actually
clickable") opens the modal via the rail's empty-state CTA and clicks through Before, asserting
both `aria-pressed` and the trigger label. Verified the test actually catches the regression (reverted
the fix, confirmed the test fails with the exact "subtree intercepts pointer events" symptom;
restored the fix, confirmed green).

**New e2e infrastructure:** `SessionDiscoverModal`'s "Join a match" CTA only renders when the rail's
upcoming-matches list is empty, and every existing e2e fixture user has real upcoming sessions by
default — no existing spec ever opened this modal at all. Added a new `sessionsEmpty` override
(`e2e/mocks/overrides.ts`, `e2e/mocks/mockServer.ts`, `e2e/mocks/handlers/sessions.ts`'s
`/sessions/mine` + `/sessions/group/:groupId` handlers, `e2e/mocks/fixtures.ts`'s
`seedEmptyUpcomingMatchesOnNextLoad`), same `override/*Empty` shape as the existing `feedEmpty`/
`sportProfilesEmpty` overrides.

**Two related, deferred findings — filed as real backlog tickets, not left as prose** (CLAUDE.md's
"file the moment it comes out" rule): while writing the new e2e test, found that (1) pressing
Escape while a filter popover is open closes the whole `SessionDiscoverModal` too, not just the
popover (**CLIENT-SESSION-27**), and (2) `DiscoverLocationFilter`'s search text input can be
clicked but not typed into inside this modal — the Dialog's focus trap yanks focus back inside
itself immediately, since the input lives in a Popover portaled outside the Dialog's DOM subtree,
same structural root cause as the pointer-events bug but a different Radix subsystem
(`FocusScope`, not the CSS cascade) (**CLIENT-SESSION-28**). Neither is fixed in this delta —
button clicks (the reported bug) work correctly; only Escape-key layering and sustained typing in
a nested Popover's input remain broken.

**Testing (delta 2):** new `e2e/flows/home-feed-journey.spec.ts` test (above). Full Vitest suite
re-verified green after the fix (187/187 files). tsc/eslint clean (same 2 pre-existing warnings).
`e2e` project re-verified: same single pre-existing `feed-groups-journey` flake as delta 1, nothing
new.

---

🤖 Generated with [Claude Code](https://claude.com/claude-code)
