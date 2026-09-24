# CLIENT-SESSION-29 · Complete the Discover session feature

**Status:** `DONE` (2026-09-23)
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
   - **Resolved at pickup (2026-09-23):** applies to **both** Discover surfaces — the `/matches`
     page panel (`SessionDiscoverPanel`) and the rail's `SessionDiscoverModal`.
   - **Resolved at pickup (2026-09-23):** the existing favorites checklist **stays** alongside
     "Choose a location" — both are present; "Choose a location" is an additional way to add a
     one-off (non-favorited) location to the checkable list, not a replacement for favorites.
   - **Resolved at pickup (2026-09-23):** if the chosen location matches one already in the list
     (e.g. already favorited), **dedupe** — select/check the existing row rather than adding a
     second, duplicate-looking entry.
   - **Built:** `DiscoverLocationFilter` gained a trailing "Choose a location…" row that opens the
     real `LocationPicker` Dialog via a new `selectLocation` (always adds/re-selects — never
     toggles off, unlike the existing `toggleLocation`) threaded through
     `useDiscoverBaseFilters.ts`'s own `useLocationPickerData` instance. `LocationPicker` renders
     as a *sibling* of the hosting Dialog, not nested inside `DialogContent` — same "Dialog-in-
     Dialog via portal, not literal JSX nesting" pattern `CreateSessionModal`'s own
     `LocationFavoritesDropdown`/`LocationPicker` pairing already uses, so no new nesting risk.

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
   - **Resolved at pickup (2026-09-23):** the filing conversation's unfinished fragment "above
     today result" was **not** about this filter item at all — it referred to where the new
     "Requested sessions" section (item 4 below) renders. Re-confirmed with the user; see item 4's
     resolution. No new "future dates only" filter is in scope.
   - Duration filter explicitly dropped from scope (no backend support exists for it today — would
     be a new cross-module dependency on `session-impl`, out of scope for this ticket).
   - **Built:** `DiscoverStatusFilter`/`DiscoverOpenSlotsFilter`/`DiscoverFeeFilter` (new,
     `components/`), wired into `useDiscoverBaseFilters.ts` (shared, so both surfaces get them for
     free) and `discoverParams.ts`'s `DiscoverFilters`/`buildDiscoverParams`/
     `serializeDiscoverFilters`. Status only ever offers Preparing/Scheduled
     (`DISCOVERABLE_STATUSES`) — `/discover` silently strips `ONGOING` and 400s on
     `COMPLETED`/`CANCELLED` (SESSION-37), so neither is a real option. Fee's `feeType` is a
     single-value toggle (server param, not a list) with an independent `maxFeeAmountVnd` ceiling.
     `e2e/mocks/handlers/sessions.ts`'s `discoverableSessions()` extended to actually filter on all
     four new params (previously title/locationId only) so the new e2e coverage proves something
     real, not MSW ignoring the params either way.

4. **New "Requested sessions" section**, backed by `GET /api/sessions/requested` (backend
   SESSION-42, `DONE`, already shipped — zero existing client callers today, confirmed via a full
   codebase search at filing time). Renders always-expanded (not collapsible), with its own empty
   state when there are zero requested sessions (it does not hide).
   - **Resolved at pickup (2026-09-23), corrects the original filing:** this section is **not**
     placed alongside "My sessions" — it lives inside the **Discover panel** on `/matches`,
     positioned below the filter controls and above the results list's first/today date group.
     (The modal has no equivalent — Discover-in-modal has no "Requested sessions" concept; this
     section is `/matches`-page-only.)
   - **Built:** new `hooks/useRequestedSessions.ts` (`useInfiniteQuery` on `/sessions/requested`,
     no filter params) + `RequestedSessionsSection.tsx` (reuses `DiscoverResultsList` as-is, no
     collapse chevron). Composed in `useMatchesPageData.ts` (not `useDiscoverFilters.ts` — this
     endpoint has no filters and the section needs `groupName` resolution against the page's
     already-fetched `groups` list, which `useDiscoverFilters` doesn't have and shouldn't fetch a
     second time). New `sessionKeys.requested()` — its own top-level key, not nested under
     `'discover'` (unlike `/discover`, this endpoint isn't sport-profile-gated, so it doesn't need
     `useAddSportProfile`'s discover-invalidation to also catch it). `SessionCard`'s existing
     `getParticipationAction` already renders "Cancel" for a `REQUESTED` `callerParticipation` —
     no new participation-action logic needed. New `e2e/mocks/handlers/sessions.ts` handler (the
     endpoint had zero MSW coverage before this ticket, despite backend SESSION-42 shipping it
     weeks earlier) — registered before the `:sessionId` catch-all, same route-ordering rule every
     other literal-path handler here already follows.

5. **Bug fix — Discover modal's Time filter doesn't auto-apply on hour/minute edit.** In
   `SessionDiscoverModal` specifically (confirmed at filing that `SessionDiscoverPanel`/the
   `/matches` page works correctly), editing the Hour/Minute number inputs in
   `DiscoverTimeFilter`'s popover doesn't update the result list or the trigger's own label — only
   clicking Before/After applies the change.
   - **Resolved at pickup (2026-09-23) — the filing's own hypothesis was wrong.** The hook-wiring
     between `SessionDiscoverModal`'s pages and `DiscoverTimeFilter` is byte-identical to the
     working `/matches` page's wiring (`data.setStartTime` vs. `discoverModalData.setStartTime`) —
     confirmed by grep before touching any code. Live Playwright repro instead showed
     `document.activeElement` going `null` the instant the Hour input was clicked: the **same
     root cause CLIENT-SESSION-28 already diagnosed** (Dialog's `FocusScope` trap treats a
     `Popover`'s portaled content — a `document.body` sibling of the Dialog's own Content, not a
     descendant — as "escaped the boundary" and yanks focus back on every `focusin`). Fixed at the
     shared primitive: new `shared/ui/floatingPortalContainer.ts` context, provided by
     `DialogContent` (its own Content DOM node) and consumed by `PopoverContent` (portals into it
     via `Popover.Portal`'s `container` prop instead of `document.body` whenever one is available)
     — the popover becomes a real DOM descendant, so `FocusScope`'s `container.contains(target)`
     check is `true` and the trap never fires. This is the general fix CLIENT-SESSION-28 itself
     scoped as its "likely fix direction, not yet designed" — done here instead of deferred again,
     since this ticket's own bug turned out to need it. Confirmed live: Hour/Minute edits now
     commit and the trigger label/results update immediately; the Location search input (CLIENT-
     SESSION-28's own case) also typeable now; no popover clipping/mispositioning regression despite
     the Dialog's `overflow-hidden`/`transform` (Radix Popper's `strategy: 'fixed'` already accounts
     for a transformed containing block). **CLIENT-SESSION-27's Escape-cascades bug is untouched** —
     confirmed it's a genuinely different Radix subsystem (`DismissableLayer`'s global mount-order
     layer stack, not `FocusScope`'s DOM-containment check), stays open as its own ticket.

**Who:** Normal User, on the `/matches` page and the rail's "Join a match" modal (Home Feed/
Groups/Friends/Profile).

**Entry point:** `/matches` page's Discover panel (including its new Requested-sessions section,
between the filter controls and the results list) and "My sessions" area; the rail's
`SessionDiscoverModal`.

**Inputs/outputs:** New filter UI state (status/open-slot/fee selections) feeding existing
`/discover` query params; a new `GET /api/sessions/requested` data hook and section component; a
new date-label formatting function; a `LocationPicker`-based flow replacing the location search
box.

**Edge cases:**
- Zero requested sessions — the section always renders, showing its own empty state (resolved at
  pickup, see item 4).
- A location chosen via "Choose a location" that's already in the checklist (e.g. already
  favorited) — deduped, selecting the existing row (resolved at pickup, see item 1).

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

## Verification (2026-09-23)

Delivered in two sub-passes — (A) Location redesign + date-label format + the Time-filter/
FocusScope fix, (B) the three new filters + Requested-sessions section — each independently
verified before moving on, per the same "root cause first, verify live" discipline this session's
earlier `CLIENT-SESSION-22` popover fix used.

- **tsc/eslint:** clean across every touched file, both sub-passes (only a pre-existing, unrelated
  `SessionStartTimePicker.tsx` warning, confirmed present on unmodified `master` too).
- **Vitest:** 191 files / 1405 green (full suite, both sub-passes combined) — up from 187/1385 at
  the end of sub-pass A; the +4 files/+20 tests are the three new filter components'
  `.test.tsx` files plus `RequestedSessionsSection.test.tsx` and added cases in existing files
  (`discoverParams.test.ts`, `useDiscoverFilters.test.tsx`, `discoverDateLabel.test.ts`,
  `SessionStartTimePicker.test.tsx`).
- **e2e (`e2e` project):** 83/85 passed both sub-passes' final runs. The 2 failures are pre-existing,
  confirmed-unrelated flakes: `feed-groups-journey.spec.ts`'s reactivate-nudge test fails
  identically on unmodified `master` (stash-and-rerun proof); `matches-journey.spec.ts`'s own test
  is a parallel-worker-load flake on this machine — confirmed by (a) a stash-and-rerun on
  unmodified `master` failing a *different*, unrelated test the same session, and (b)
  `--workers=1` passing all 3 `matches-journey.spec.ts` tests cleanly, including this ticket's own
  new steps. New coverage added: `home-feed-journey.spec.ts`'s Time/Location-popover-focus
  regression test (sub-pass A); `matches-journey.spec.ts`'s new step 8c (Status/Open-slots/Fee
  filters — positioned *before* step 9, which joins and thereby removes the only discoverable
  fixture from the pool) and step 10c (Requested-sessions section). `e2e/mocks/handlers/
  sessions.ts` gained a `/sessions/requested` handler (previously nonexistent — zero MSW coverage
  despite the real endpoint shipping weeks earlier) and `discoverableSessions()` was extended to
  actually filter on `status`/`minOpenSlots`/`feeType`/`maxFeeAmountVnd` (previously only title/
  locationId), so the new e2e assertions prove something real rather than MSW silently ignoring
  the new params either way.
- **visual-regression:** stash-and-rerun (sub-pass A, the shared-primitive change) — byte-identical
  111/111 Windows-noise-floor failure set on `master`, zero incremental diff. Sub-pass B added no
  new visual-regression exposure: no `/matches`-page or Discover-panel visual spec exists in this
  repo at all (confirmed — the 8 existing specs cover create-session-modal, groups, home-feed,
  notification-bell, post-modal, profile, session-detail-modal, sport-reactivate only), so the new
  filter pills/Requested-sessions UI have no baseline to diff against.

**Real, unplanned finding along the way:** `useMySessions.ts` still calls `GET /api/sessions/mine`,
which backend SESSION-27 removed 2026-09-15 (replaced by `/upcoming`+`/history`) — "My sessions" on
`/matches` has been silently broken against the real backend since then (MSW still mocks `/mine`
regardless, masking it in every test run). Not fixed here — squarely `CLIENT-SESSION-23`'s scope
(the Upcoming/History split), which was already queued and whose blocker (SESSION-27) is now
confirmed shipped/unblocking it. Flagged to the user during pickup; no new ticket needed since
CLIENT-SESSION-23 already covers it.

## Revision (2026-09-23, post-build UI refinement)

User feedback on the just-built feature, applied in place on the same branch before merge (work
was already committed-locally-but-unpushed at this point, so this landed as a same-ticket revision
rather than a new one):

- **Discover modal:** the old "Sessions/Location/Gear" search-scope `<select>` (always effectively
  just "Sessions" — see item 1 above) is replaced by a sport dropdown (`DiscoverModalSportSearchBox`,
  new) over the caller's own held sports. Pre-filled from the hosting page's active sport pill, or
  the caller's first held sport when the pill is `'all'`/absent (`FriendsPage`, which has no pill at
  all). Previously the modal was permanently locked to whichever sport the pill happened to be on
  when it opened; picking a different sport in the dropdown now actually re-scopes the query
  (`useDiscoverModalFilters`'s `sportId` became overridable local state, seeded from the hosting
  page's value on every closed→open transition rather than fixed for the modal's lifetime).
- **Discover page:** the same search-scope `<select>` drops its two always-inert `location`/`gear`
  options (`DiscoverSearchBox`) — offering two choices that could never do anything was itself the
  confusing part, not just their `disabled` state. Date filter's trigger label now shows the actual
  date once exactly one is checked (`Today`/`Thu, 15th Oct`) instead of staying the generic "Date";
  0 selected still reads "Date", 2+ still reads "Date (N)" (`DiscoverDatePicker`, new `dateLabel`
  prop reusing `formatDiscoverDateLabel`).
- **Both surfaces:**
  - Location filter: dropped the selected-locations chip row inside the popover (the checklist's own
    checkboxes already show selection); each row's name now truncates to one line with the full name
    as a `title` tooltip.
  - Open-slots filter: converted from a Popover-hidden single input to a direct inline number input
    (`DiscoverOpenSlotsFilter`) — it's the only filter with exactly one control, so hiding it behind
    a trigger button cost a click for no benefit; moved to the last position in the filter row;
    floor raised from 0 to 1 (0 open slots is a no-op filter).
  - Status filter: `PREPARING`/`SCHEDULED` were independent checkboxes that could reconstruct the
    same "both" default by checking both — now mutually exclusive (same click-to-clear toggle
    precedent `feeType` already used), and the trigger label shows the picked status
    (`Status (Preparing)`) instead of a count.
  - Fee filter: the trigger label now reflects `maxFeeAmountVnd` too, not just `feeType` — a caller
    who only set a max amount previously saw a bare "Fee" with no indication anything was filtered.
  - Results list: "Load more sessions" → "Load more"; a new "No more to load." message renders once
    the last page has loaded (previously rendered nothing, giving no confirmation the list had
    actually ended).

**Verification:** `tsc -b --noEmit` and `eslint src/ e2e/` clean (same pre-existing unrelated
`SessionStartTimePicker.tsx` warning only). Vitest: 191 files / 1413 green (+8 tests — new
Storybook-adjacent assertions in `DiscoverStatusFilter`/`DiscoverFeeFilter`/`DiscoverDatePicker`/
`DiscoverLocationFilter`/`SessionDiscoverPanel`/`SessionDiscoverModal.test.tsx`, including new
coverage for the modal's sport dropdown). e2e (`e2e` project, full suite): 83/85 passed — the same
2 pre-existing, confirmed-unrelated flakes as the original Verification section above
(`feed-groups-journey.spec.ts`'s reactivate-nudge test; `matches-journey.spec.ts`'s step 11 create/
complete flow), both proven environmental again via `--workers=1` passing every
`matches-journey.spec.ts` test cleanly in isolation. `matches-journey.spec.ts` itself updated: step
8c's Open-slots assertions no longer open/close a Popover (direct input now), and step 10b's Date
pill click now targets `'Today'` (exact) instead of `'Date'`, since exactly one date (today) is
selected by default. No visual-regression exposure — still no `/matches`-page or Discover-panel
visual spec in this repo (unchanged from the original Verification section's finding).

## Revision 2 (2026-09-23, second round of post-build UI refinement)

Further user feedback on the same branch, still unpushed:

- **Open slots:** now clamped to `1..998` (was floored at `1` with no ceiling) — a session's
  capacity has no real-world reason to reach 999. `useDiscoverBaseFilters`'s derived `minOpenSlots`
  clamps both ends; `DiscoverOpenSlotsFilter`'s input carries matching `min={1}`/`max={998}` as the
  HTML affordance (spinner/native validity), same "affordance only, hook owns the real clamp" split
  the floor already used.
- **Fee/Status trigger labels:** drop the filter-name prefix once a value is picked — "Free" /
  "Preparing" instead of "Fee (Free)" / "Status (Preparing)". Unset still reads "Fee"/"Status".
- **Location filter — real bug found and fixed:** the checklist rows were *not* actually
  truncating despite Revision 1's `truncate`/`title` classes — visually confirmed via a throwaway
  Playwright script against the `LongLocationName` Storybook story (added in Revision 1) before and
  after the fix, since the Chrome extension wasn't connected for a live check and jsdom can't
  reproduce real layout at all. Root cause: `<fieldset>` carries a browser-default
  `min-width: min-content` that isn't part of any reset this app applies, so it refused to shrink
  below the longest row's intrinsic width regardless of the `Popover`'s fixed `w-72` — the fieldset
  itself was rendering at 519px inside a 288px popover, visually overflowing rather than
  truncating. Fixed with one class, `min-w-0` on the fieldset. Confirmed via the same script:
  `scrollWidth` (479px) now exceeds `clientWidth` (234px) for the long name specifically (genuine
  clipping), while a short name's `scrollWidth`/`clientWidth` stay equal (no truncation applied
  where none is needed).
- **Time filter:** trigger label shortened from "Start before/after HH:MM" to "Before/after
  HH:MM".
- **Requested sessions:** made collapsible (was always-expanded, no toggle) — same chevron +
  `{label} (count)` header shell as `DiscoverDateSection`, local `useState` toggle (not wired to any
  parent state, since unlike a per-date section this one doesn't gate a lazy fetch). Header reads
  "Requested sessions (N)" where N is the number of items loaded so far (no separate
  `/requested/counts` endpoint exists). Empty-state copy ("No requested sessions.") was already
  correct from Revision 1 — the feedback's own wording matched what was already shipped.

**Verification:** tsc/eslint clean (same pre-existing unrelated warning only). Vitest full suite:
191 files / 1414 green. `home-feed-journey.spec.ts` updated for the Time filter's shortened label
in two spots: the visibility assertion (`/^Before \d{2}:\d{2}$/`, was `/^Start before .../`) and
the click that closes the Time popover before opening Location — the latter needed the *exact*
time-suffixed pattern, not just `/^Before/`, since that prefix now also matches the popover's own
inner "Before" direction-toggle button once the trigger dropped its "Start " prefix (a real strict-
mode collision Playwright caught, not just a rename). No other e2e assertion depended on the
Fee/Status label text or the open-slots ceiling. e2e (`e2e` project) `matches-journey.spec.ts` +
`home-feed-journey.spec.ts`: 6/6 passed serially after the fix above.

## Revision 3 (2026-09-23, third round of post-build UI refinement)

Further user feedback, still the same unpushed branch:

- **Location filter:** a location chosen via "Choose a location…" that isn't already a favorite
  now also shows up, checked, in the checklist (same "selected-but-not-in-the-base-list still
  renders" precedent `DiscoverDatePicker`'s own `customDates` already established) —
  `DiscoverLocationFilter`'s `rows` computation extended to `[...favoriteLocations,
  ...chosenNotFavorited]`.
- **Requested sessions:** the "No requested sessions." empty-state copy was already correct from
  Revision 1 (the feedback's own wording matched what had already shipped) — confirmed, no change
  needed.
- **Open slots:** clamp corrected from `1..998` to `1..999` inclusive (direct clarification).
  "Only number input, no (-) input, auto reset to limitation": `onChange` now strips every
  non-digit character (not just `-`), and the displayed value re-clamps into range on blur — the
  same "auto reset" behavior `DiscoverTimeFilter`'s Hour/Minute inputs already had.
- **Active-filter styling (all six Discover filters):** once a filter carries a non-default value,
  its pill background switches to a new `--color-filter-active` token and a red "x" (reusing the
  existing `text-danger` token) appears to reset it to default in one click, without opening the
  filter's own popover. Built as a new shared `DiscoverFilterTrigger` component (the "x" and the
  label+chevron are sibling buttons, not one nested in the other — nesting interactive controls is
  invalid HTML and the two need independent click targets) reused by Date/Time/Location/Status/Fee;
  `DiscoverOpenSlotsFilter` (no `Popover`/trigger to wrap) applies the same treatment inline. Two
  new hook-level "reset to default" handlers: `clearLocationFilter` (clears every selection) and
  Date's `resetDateSelection` (resets to `[today]`, not `[]` — Date's own default is today
  selected, unlike every other filter's "unset" default). Status reuses its existing
  `toggleStatus(selected)` as its own reset, no new handler needed.
  - **Color correction (same day):** the active-background token was corrected from an initial
    `#abdbe3` to `#c3e5eb` per direct follow-up.
  - **Open-slots spinner buttons (same day):** the native number-input increment/decrement
    spinner turned out to render as its own opaque shadow-DOM box that **ignores
    `background-color` in current Chromium** — confirmed empirically (a `::-webkit-inner-spin-
    button` rule matched and applied per devtools, with zero visual effect) before concluding it
    couldn't be recolored directly. Replaced with hand-drawn up/down buttons (plain DOM nodes,
    no background of their own, so the pill's own active background already shows through them
    correctly) and hid the native spinner entirely (`index.css`'s `.discover-open-slots-input`
    rules) rather than leave a second, redundant pair showing.
  - Visual confirmation for both the location-truncation fix (Revision 2) and this round's active-
    background/spinner work used the same throwaway-Playwright-against-Storybook technique (the
    Chrome extension was unavailable for a live check) — screenshots + `scrollWidth`/`clientWidth`/
    `getComputedStyle` assertions before and after each fix, not just code review.

**Verification:** tsc/eslint clean (same pre-existing unrelated warning only). Vitest: session
suite 28 files / 306 tests green (full suite re-run pending final report). New/updated tests:
`DiscoverFilterTrigger.test.tsx` (new — the shared active-background/reset-"x" behavior, tested
once rather than duplicated per filter), plus reset-"x" coverage added to each of
`DiscoverDatePicker`/`DiscoverTimeFilter`/`DiscoverLocationFilter`/`DiscoverStatusFilter`/
`DiscoverFeeFilter`/`SessionDiscoverPanel`'s own test files, and `DiscoverOpenSlotsFilter.test.tsx`
rewritten for the hand-drawn increment/decrement buttons and the `1..999` clamp. No e2e assertion
depended on the old spinner/Fee-count trigger text.

## Revision 4 (2026-09-23) — /matches drops the "All" sport pill

Direct user decision, mid-session: `/matches` no longer offers "All sports" — the switcher always
has exactly one real sport active, same "no `'all'` state, default to the caller's first sport
profile" shape `/profile` already established (PROFILE-4). This is a materially different
architecture than Revision 1-3's UI-only changes, not just a style tweak:

- **`matchesPageStore.ts`:** `activeSport: SportKey | 'all'` (default `'all'`) → `activeSport:
  SportKey | null` (default `null`, meaning "not yet resolved") — same shape as
  `profilePageStore.ts`'s own PROFILE-4 delta, doc comment cross-references it directly.
- **New `useMatchesActiveSport.ts`** (mirrors `useProfileActiveSport.ts` exactly): resolves
  `null` to the caller's first sport profile once `/sports/profiles` loads, persists the pick back
  into the store once. Returns `undefined` only for a zero-sport-profile caller — `MatchesPage`'s
  own existing zero-profile gate handles that, not this hook.
- **`useMatchesPageData.ts`:** uses the new hook instead of reading the store directly;
  `activeSportId` and `mySessionDateGroups`' filter both dropped their `'all'` branches — the
  latter now shows nothing (not everything) while `activeSport` is still resolving, since "show
  everything" was exactly the "All" behavior being removed.
- **`MatchesPage.tsx`:** `<SportSwitcher showAllPill={false} .../>`, `active={data.activeSport ??
  'all'}` and an `onChange` guard (`if (key !== 'all') …`) — same fallback trick
  `ProfilePage.tsx` already uses for its own no-`'all'` switcher (the guard is dead code in
  practice, since `showAllPill={false}` means the pill can never actually be clicked, but
  `SportSwitcher`'s `onChange` type still allows it).
- **`matches-journey.spec.ts` (major rewrite):** this spec's single continuous `test()` interleaves
  sessions from two different sports across its whole 11-step journey (`mockSession`/"Sunday pickup
  run" is Pickleball; `mockGroupSession`/"Friday 5-a-side", `mockDiscoverableSession`/"Weekend
  5-a-side", `mockRequestedSession`/"Wednesday scrimmage" are all Badminton) — every step relied on
  "All" showing every sport's sessions at once. Rewritten with 4 new explicit pill-switch steps
  (4b/5c/8d/10d) inserted exactly where a later step needs the other sport's sessions visible;
  step 1 rewritten for the new Badminton-by-default load state (Pickleball's own session is *not*
  visible until step 2 switches to it); step 2's "'All' restores it" half dropped since there's
  nothing to restore to. `mockRequestedSession`'s own section needed no switch — confirmed
  `GET /sessions/requested` has no `sportId` param, so "Requested sessions" was never sport-
  filtered to begin with.

**Verification:** tsc/eslint clean. New `useMatchesActiveSport.test.tsx` (mirrors
`useProfileActiveSport.test.tsx`'s 3 cases exactly). `matchesPageStore.test.ts`/
`useMatchesPageData.test.tsx`/`MatchesPage.test.tsx` updated for the `null`-not-`'all'` default —
`useMatchesPageData.test.tsx`'s shared `mockGets` helper gained a `/sports/profiles` default
(single Basketball profile, matching every fixture session's own default `sportId`) so
`useMatchesActiveSport` has real data to resolve against, and its "filters both panels by
activeSport" test was rewritten around two profiles (football first, basketball second) proving a
switch between two *specific* sports rather than "unfiltered → filtered". e2e: full rewritten
`matches-journey.spec.ts` (all 3 tests) + `notification-bell.spec.ts` + `home-feed-journey.spec.ts`
all passed serially — the shell-level notification modal doesn't route through `/matches`'s own
sport-filtered panels at all, confirmed unaffected rather than assumed.

## Revision 5 (2026-09-23/24) — the "2 pre-existing flakes" were real bugs, not flakes

User pushback ("why don't we fix the e2e failed feed-groups-journey.spec.ts?") was correct — both
of Revision 1-4's "confirmed-unrelated flakes" turned out to be genuine, fixable bugs once actually
investigated with `--workers=1` isolation instead of accepted on the strength of an earlier
stash-and-rerun result. Neither was actually random:

- **`feed-groups-journey.spec.ts`'s reactivate-nudge test — a real race, reproduced 100% in
  isolation** (not intermittent): `GroupsPage.tsx`'s `selectGroupAndShowPosts` gates the group
  nudge on `inactiveSports` from `useResumableSports()`'s own separate `GET /sports/profiles?
  includeInactive=true` query — a query the Group-filter row's own rendering never waits on. The
  test clicked "Weekend Tennis Ladder" immediately after `seedAuthenticatedSession`, before that
  query could resolve, so `inactiveSports` was still `[]` at click time and the nudge gate silently
  passed the click through with no dialog. Confirmed via a clean `error-context.md` DOM snapshot at
  failure: the group had already switched, no dialog existed. Fixed in the test, not the app —
  `client/CLAUDE.md`'s own account-lifecycle-style "gate check must be based on real state, not a
  timing assumption" reasoning applies to the *test* here, not the app: waiting for the muted
  "Reactivate Pickleball" Sport-filter pill (driven by that exact same query) before clicking is a
  real readiness signal, not an arbitrary delay — the sibling "Home Feed" nudge test right above it
  in the same file already used this same pattern, which is presumably why only the Groups variant
  was ever seen failing.
- **`matches-journey.spec.ts`'s step-11 timeout — a real regression this session's own earlier
  rewrite introduced**, not environmental load: timing a *passing* run with
  `--reporter=list` showed the test completing in ~29.1s against Playwright's 30s default —
  already the suite's longest test, and Revision 4's 4 new sport-pill-switch steps
  (4b/5c/8d/10d) added enough real additional work to leave it with no margin at all. Any
  ordinary variance in machine load then tipped it into a timeout on whichever operation happened
  to be in flight when time ran out — which is exactly why every prior occurrence looked like it
  failed at a "different point" each time; that was never a symptom of test-order flakiness, it was
  wherever the clock happened to run out. Fixed with `test.setTimeout(60000)` — more budget for
  genuinely more work, not a papered-over race. Confirmed via 3 consecutive clean isolated runs at
  ~29.3s (comfortable margin against 60s), then a full-suite run.

**Both fixes verified together:** tsc/eslint clean; full `e2e` project run: **85/85 passed, zero
failures** (previously reported as "84/85, 1 pre-existing flake" across several runs this
session — that framing undersold it; both were fixable, and now fixed).

## Revision 6 (2026-09-24) — a CI-only failure this session's own work introduced

After Revision 5's push, CI reported `home-feed-journey.spec.ts`'s "Time/Location popovers stay
focused and typeable" test failing on `getByLabel('Hour')` — not a value mismatch,
`Error: element(s) not found` for the full 5s retry window, right after `hourInput.blur()`.
Investigated the same way as Revision 5's two bugs (never accepted as "just CI flakiness" without
evidence): ran it isolated, file-scoped, and under the full 8-worker suite locally — passed every
time (Windows/Chromium), and a throwaway diagnostic spec confirmed the popover and Hour input both
survive `.blur()` reliably here (focus lands on `<body>`, nothing closes). Could not reproduce
locally, so this is a genuine cross-platform (CI is Linux) behavior difference, not something
provably fixed by direct repro.

The one real suspect in the *test itself*: `.blur()` is a synthetic call with no specific focus
destination, unlike a real user action — exactly the kind of interaction that can behave
differently across Chromium builds/OSes when something (here, Radix's own focus tracking) cares
where focus actually lands. This test itself was new code from earlier in this session (the
FocusScope regression test), so it had never actually run in CI before this push — its own
`.blur()` pattern was unproven there, not a previously-passing check that broke.

**Fix:** replaced `hourInput.blur()` with `hourInput.press('Tab')`, asserting focus lands on the
Minute input (still inside the same popover) before checking the committed value — a deterministic,
realistic interaction instead of an ambiguous one, and arguably a better test of the FocusScope
fix's actual intent (focus moving naturally within the Dialog-nested Popover) than a blur to
nowhere in particular.

**Verification:** tsc/eslint clean; the specific test run 3x isolated + once file-scoped, all green;
full `e2e` project: 85/85 passed (`matches-journey.spec.ts` at 29.5s, still comfortable margin
against its 60s budget). Cannot confirm this fixes the *specific* CI environment without another CI
run, but the change removes the one plausible platform-sensitive element from the test without
weakening what it actually verifies.

### Revision 6, correction — the `Tab` change above did NOT fix it; the real cause was a product bug

CI failed again on the `Tab` version (`getByLabel('Minute')` gone right after `Tab`), which proved
the `.blur()` theory wrong: it was never about how focus leaves the Hour input. The user then
reported it also happened in a real local browser — **only the Time popover closed** — and added
temporary `onFocusOutside`/`onOpenChange` logging (removed afterwards), which showed the popover was
dismissed by `focusOutside` whose target was the **Dialog's own content `<div role="dialog">`**.

**Root cause (reproduced deterministically once the right condition was found):**
1. Tab from Hour: `focusout` fires while `document.activeElement` is briefly `<body>` (traced:
   Hour blur at 5.5ms, Minute focus at 13ms).
2. The Hour commit changes the discover filters. `useDiscoverTodaySessions` has no
   `placeholderData`, so a **non-empty** result grid is removed and replaced by "Loading…"
   synchronously, inside that window.
3. The Dialog's `FocusScope` reacts to "body focused + a node removed" by focusing its own
   container.
4. The nested Popover reads that as focus outside itself and dismisses; Minute never gets focus.

**Why nothing reproduced it locally for hours:** the e2e mock's time filter *empties* the list at the
moment of the commit (a "before 05:xx" filter excludes the fixture session), so there was nothing to
remove. Real data has cards, and CI does depending on the hour it runs. Ruled out along the way
(all passed): UTC timezone, browser clock at all 24 hours, `CI=true` + repeats, 8-worker parallel
load, headed mode, slow (400ms/1200ms) discover responses. The reproduction that finally matched
the user's log exactly (`popover=0`, `activeElement=DIV:dialog`) was forcing the results to stay
non-empty by stripping `startTime`/`startTimeFilter` from the mocked request.

**Fix, in two layers:**
- `DiscoverTimeFilter`: the parent filter update in `commitHour`/`commitMinute` is wrapped in
  `startTransition`, so the re-render (and the grid removal) happens after focus has landed on
  Minute and FocusScope sees a real focused element.
- `shared/ui/popover.tsx` (`PopoverContent`): `onFocusOutside` is prevented when the target is the
  Dialog's own container (the `floatingPortalContainer` node). That is the Dialog protecting itself,
  not the user leaving the popover — the same Popover-inside-Dialog family as the FocusScope fix
  this ticket already shipped. Any other outside focus still dismisses. This also protects every
  other Dialog-nested popover, and the synthetic `.blur()` path.

**New regression test:** `home-feed-journey.spec.ts` — "tabbing out of the Time filter's Hour input
keeps the popover open with results on screen" (forces non-empty results). Verified it **fails
without the fix** (stashed the two source files, `toBeFocused` on Minute failed) and passes with it.
Repro outcomes with the fix: `Tab` → popover open, focus on Minute; `.blur()` → popover open
(focus on the dialog container, since a blur has no destination).
