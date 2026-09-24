# CLIENT-SESSION-23 · "My sessions" → Upcoming/History split, SessionCard polish, completion favorites

**Status:** `DONE` (2026-09-24)
**Type:** Client feature
**Depends on:** backend **SESSION-43** (added 2026-09-24 — see "Scope change" below) and **SESSION-27** (`modules/session/docs/BACKLOG_MVP.md`) — hard, for the
"Upcoming sessions"/"History" scope only (items 2-3 below). Items 1, 4, and 5 have no backend
dependency and can be built first if this ticket is picked up before SESSION-27 ships.
**Filed:** 2026-09-15, user request — bundled with the SESSION-27 backend work as one client
follow-up (user decision: keep as one ticket rather than split by dependency, unlike this repo's
usual precedent for mixed-dependency scopes, e.g. CLIENT-SESSION-2's 3/4/5/6 split). Reworks
CLIENT-SESSION-20's single "My sessions" panel (still `DONE`, shipped, not broken — just being
superseded by a clearer two-section design) and closes a real bug found while verifying
CLIENT-SESSION-21: `useUpcomingMatches.ts`'s client-side status filter
(`status === 'SCHEDULED' || status === 'ONGOING'`) never included `PREPARING`, so a `PREPARING`
session never appeared in the `UpcomingMatches` rail on Home Feed/Groups/Friends/Profile.

## Scope

1. **`SessionCard` polish** (shared component — every surface: Matches page list/grid, Discover,
   the `UpcomingMatches` rail):
   - The participation action button row sticks to the **bottom** of the card regardless of how
     much content is above it (title/location/fee/etc. of varying length today leaves the button
     row at inconsistent heights across cards in the same list/grid).
   - The location line renders on a **single line**, truncated with an ellipsis if it doesn't fit
     — no wrapping to a second line.

2. **"My sessions" → two independent sections** on the Matches page, replacing the single "My
   sessions" label/panel (CLIENT-SESSION-6/20):
   - **"Upcoming sessions"** — backed by `GET /api/sessions/upcoming` (SESSION-27), page size 20,
     server-sorted soonest-first. Retains the existing day-group headers ("Today" / "Sep 20, 2026")
     above clusters of cards (user decision) — reuse `groupSessionsByDate.ts`'s day-grouping logic,
     trimmed to a single zone now that "history" is no longer date-grouped client-side (see below).
     "Load more" at the end of the list fetches the next page once the server response says more
     exist — reuse the existing `useInfiniteQuery` pagination pattern already used elsewhere
     (`useComments.ts`, `usePersonalFeed.ts`), not a new mechanism.
   - **"History"** — backed by `GET /api/sessions/history?dateCount=20` (SESSION-27's per-date-list
     shape). Renders one **collapsed row per distinct date** in the format `<date> (<count>)` (e.g.
     "Sep 14, 2026 (2)", "Today (1)" using the same "Today" special-case `groupSessionsByDate.ts`
     already has) — collapsed by default. Expanding a date row lazily fetches that date's session
     list via `GET /api/sessions/history?date=<date>` (paginated 20 at a time; a nested "Load more"
     inside the expanded row if that single date has more than 20 sessions — an edge case, but
     SESSION-27 paginates this endpoint too so it's supported). A "Load more" button after the last
     date row pages further back via SESSION-27's `before` cursor, fetching the next 20 distinct
     history dates.
   - `useMatchesPageData.ts`'s current `mine` + `joined` + per-group-session fan-out/merge
     (`useMySessions`, `useJoinedSessions`, `useGroupSessionsForGroups`, `dedupeSessionsById`) is
     replaced entirely by the two new endpoints — `/upcoming` already covers standalone and
     group-linked sessions in one call, so the per-group fan-out goes away completely.
     `groupSessionsByDate.ts`'s dual active/history zone split (CLIENT-SESSION-20) is retired in
     favor of the new two-section, two-endpoint model; `SessionDateGroup.tsx` may need reshaping or
     replacing to fit the new single-zone-plus-collapsed-history-rows shape.

3. **`UpcomingMatches` rail migration** (`useUpcomingMatches.ts` — Home Feed/Groups/Friends/Profile):
   moves onto `GET /api/sessions/upcoming` too, dropping its own `useUserGroups` + per-group
   fan-out + `useMySessions` merge and its client-side `SCHEDULED`/`ONGOING`-only filter. This is
   what actually closes the `PREPARING`-missing-from-the-rail bug — the new endpoint's own status
   filter (`PREPARING`/`SCHEDULED`/`ONGOING`) already covers it, so there's no separate client-side
   filter left to get wrong. `UpcomingMatches`' own `maxVisible` cap still applies on top, same as
   today.

4. **`SessionPreparingCompletion` gains a favorites dropdown** for its location control — today it's
   a plain "Choose location"/"Change location" button that always opens the full `LocationPicker`
   dialog directly. Match `CreateSessionModal`'s existing `LocationFavoritesDropdown` pattern
   instead (a `DropdownMenu` listing favorite locations as quick-pick items, with a trailing
   "Choose a location…" item that opens the full picker) — `useSessionDetailModalData.ts` already
   wires real favorites data (`useFavoriteLocations`/`useFavoriteLocation`/`useUnfavoriteLocation`)
   into `completionLocationPicker` for this exact purpose (CLIENT-SESSION-21), it's just not
   surfaced through a dropdown yet. Extract `LocationFavoritesDropdown` out of
   `CreateSessionModal.tsx` into its own file (same "extract for reuse" precedent as
   `FeeTypeFields.tsx`, CLIENT-SESSION-21) so both components share one implementation.

5. **Add the `PREPARING`/completion visual-regression coverage CLIENT-SESSION-21 never got.**
   Found at that ticket's own `/updatebaseline` run (2026-09-15): `app-session-detail-modal.spec.ts`
   has 7 states, none of which render a `PREPARING` session with `canManage` — so
   `SessionPreparingCompletion` and the `PREPARING` status color have **zero** Playwright
   visual-regression coverage today, only Storybook stories + Vitest component tests. Add at least
   one new state (creator/owner-admin view, `PREPARING`, missing-both or missing-one, per
   `SessionPreparingCompletion.stories.tsx`'s existing fixtures) to that spec, at all 3 breakpoints.
   Since this ticket's own item 4 already touches `SessionPreparingCompletion`
   (`LocationFavoritesDropdown`), land this new visual case in the same PR so it isn't yet another
   separately-dispatched baseline round.

**Who:** Normal User — the Matches page and every page hosting the `UpcomingMatches` rail.

**Entry point:** `/matches` page ("Upcoming sessions"/"History" sections), and
`HomeFeedPage`/`GroupsPage`/`FriendsPage`/`ProfilePage` (the rail).

**Edge cases:**
- A date with more than 20 history sessions on it — nested "Load more" inside that expanded row
  (see Scope item 2).
- Collapsing a previously-expanded history date row and re-expanding it — re-fetch is fine
  (TanStack Query cache makes this a no-op network-wise unless stale), no special state needed.
- Zero upcoming sessions / zero history — each section renders its own empty state, independent of
  the other (one can be empty while the other has content).
- `UpcomingMatches`' `maxVisible` cap combined with the new endpoint's own pagination — the rail
  only ever requests one page sized to (or larger than) `maxVisible`, no "load more" needed there
  (unchanged from today).

**Out of scope:**
- Group-owner/admin "sessions I manage but haven't personally joined" visibility — real gap,
  flagged in SESSION-27, not solved by either ticket.
- `REQUESTED`-status sessions in "Upcoming sessions" — SESSION-27 deliberately excludes them.
- Any change to `SessionDiscoverPanel`/`SessionDiscoverModal` (`/discover`) — unrelated endpoint,
  untouched by this ticket.
- Visual redesign of the `SessionCard` beyond the two specific fixes in item 1.

**Tests:** Vitest for the new "Upcoming sessions"/"History" section components (collapsed/expanded
history row states, load-more at both levels, empty states for each section independently);
`SessionCard` sticky-button + location-truncation regression coverage (Storybook states +
component test); `useUpcomingMatches.test.ts` update proving a `PREPARING` session now appears
(the regression test for the bug this ticket closes); MSW handlers for
`/api/sessions/upcoming`/`/api/sessions/history` (both `date` and `dateCount` shapes) replacing the
now-removed `/api/sessions/mine` mock; `matches-journey.spec.ts` updated for the new section
labels/structure plus a new step covering history date expand → load more → collapse;
a new `app-session-detail-modal.spec.ts` state for `PREPARING`/`SessionPreparingCompletion` (item
5 — the coverage gap CLIENT-SESSION-21 left); visual-regression baselines for the Matches page,
the rail, and the new session-detail-modal state will all change (expected, regenerate via
`/updatebaseline`).

## Delta (2026-09-24, from CLIENT-SESSION-24's pickup)

**Every `GET /api/sessions/upcoming?date=` and `GET /api/sessions/history?date=|dateCount=` call
this ticket builds must send `viewerZoneId`** (the browser's IANA zone — reuse `getViewerZoneId()`
from `features/session/discoverParams.ts`), per backend SESSION-34/35: without it the server
buckets the day in `"UTC"` for every real user. No client caller of either endpoint existed when
CLIENT-SESSION-24 was picked up, so that ticket deliberately left the wiring here (its own scope
bullet: whichever of CLIENT-SESSION-23 or -24 wires those calls first sends it). The replacement
MSW handlers for these two endpoints should accept the `viewerZoneId` param too.

## Scope change (2026-09-24, user request at pickup) — backend `sportId` param first

**Added to scope:** both new sections ("Upcoming sessions", "History") are scoped to `/matches`'
always-active sport pill (`useMatchesActiveSport`; CLIENT-SESSION-29 removed the "All sports"
pill, so there is always exactly one active sport — same as the "My sessions" list today). The
client sends `sportId` on **every** `/upcoming` and `/history` call the Matches page makes
(alongside the `date`/`dateCount`/`before`/`viewerZoneId` params).

**Why:** neither endpoint took a sport, and a client-side filter over server-paginated data returns
short/empty pages while `hasNext` is true and makes `dateCount` per-date counts wrong (they count
every sport). User decision: extend the backend first, no client-side stopgap.

**New hard dependency:** backend **SESSION-43** (`modules/session/docs/BACKLOG_MVP.md`, filed
2026-09-24) — `sportId` on `GET /sessions/upcoming` (**optional**) and `GET /sessions/history` (**required**, both
shapes). Must land before scope item 2 is built against the real endpoint. Items 1, 4, 5 are
independent of it.

**Unchanged:** the `UpcomingMatches` rail (item 3) stays all-sports — it calls `/upcoming` with no
`sportId` (that is exactly why the param stayed optional there; Home Feed keeps its "All" pill).

**Note for the build:** `/upcoming` returns a 400 for `viewerZoneId` without `date`, so the
no-`date` Upcoming-section and rail calls must **not** send it (the 2026-09-24 Delta above applies
to `/history` and to `/upcoming?date=` only).

**Accepted behavior change (user, 2026-09-24):** moving to the participant-scoped endpoints means a
group session the caller hasn't joined, and a standalone session the caller created then left, no
longer appear in "My sessions" or the rail (the SESSION-27-flagged group-owner gap; stays out of
scope).

## Delta (2026-09-24, from the build)

- **The Delta above about `viewerZoneId` applies to `/history` only.** The Upcoming section and the rail
  call `/upcoming` *without* `date`, and the backend 400s on `viewerZoneId` without `date` — verified
  live — so neither sends it. No client caller of `/upcoming?date=` exists, so nothing sends it there either.
- **`/upcoming` `sportId` is optional, `/history` `sportId` is required** (backend SESSION-43 as shipped, not
  the "optional on both" the first scope-change note said). The Matches page sends its active sport to
  both; the `UpcomingMatches` rail sends none (all sports — Home Feed keeps its "All" pill).
- **Rail page size:** `useUpcomingMatches` reads only the first page (20) of `/upcoming`; `maxVisible` caps
  well inside that, so the rail never needs "load more".
- **The retired "My sessions" panel state was renamed** `isHistoryPanelCollapsed` → `isMySessionsPanelCollapsed`
  (it collapses the whole right panel, and "history" now names a real section).

## Implementation summary (2026-09-24)

### Approved design (restated)
Both new sections are server-scoped to the active sport pill (backend **SESSION-43**, filed and merged first
as its own PR). Data layer: `useUpcomingSessions` (infinite, size 20), `useHistoryDates` (infinite over
`dateCount=20` with a `before` cursor), `useHistoryDateSessions` (infinite, size 20, one date). The rail
(`useUpcomingMatches`) becomes one all-sports `/upcoming` call. UI: `UpcomingSessionsSection`,
`HistorySection` (collapsed `<date> (<count>)` rows) and `HistoryDateSessions`; `SessionCard` polish;
`LocationFavoritesDropdown` extracted and reused in `SessionPreparingCompletion`; MSW rewritten to be
participant-scoped (user decision: *faithful*, not an approximation of the old set); a `PREPARING` visual
state added.

### What was built
- **Data layer** (`features/session/hooks/`): the three hooks above; `queryKeys.ts` swaps `mine`/`joined`/`group`
  for `upcoming`/`historyDates`/`historyDate` (all under `sessionKeys.all`, so existing invalidations still
  cover them). `useMySessions`, `useJoinedSessions`, `useGroupSessions` and `dedupeSessionsById` are deleted.
  `useMatchesPageData` composes the two sections; the per-group fan-out, client-side sport filter and dual
  active/history zone grouping are gone. `groupSessionsByDate` is now a single-zone, **order-preserving** day
  grouper (the server owns the sort, including its `PREPARING`→`SCHEDULED`→`ONGOING` tiebreak).
- **Components:** `UpcomingSessionsSection`, `HistorySection`, `HistoryDateSessions`, `LoadMoreButton` (extracted
  from `DiscoverResultsList`, which now reuses it), `LocationFavoritesDropdown` (extracted from
  `CreateSessionModal`). `MatchesPage` keeps its collapsible panel and toggle; its body is the two sections.
  `SessionCard`: flex-column wrapper + `mt-auto` action row at both sizes; location on one truncated line
  with a `title`. `SessionDetailModal` gained one `completionFavorites` prop (bundled so the six hosts
  changed by one line each).
- **Tests:** new Vitest for every new piece; `useMatchesPageData`, `MatchesPage`, `useUpcomingMatches`
  (incl. the **`PREPARING`-appears regression test** for the bug this closes), `groupSessionsByDate`,
  `SessionCard` (sticky-bottom + truncation), `SessionPreparingCompletion` (the dropdown) rewritten/extended;
  the `/sessions/mine` mocks in the Home Feed / Friends / Groups / Profile / App tests repointed
  (`App.test.tsx` had a post-shaped catch-all the old client-side status filter had been silently
  discarding — it now gets an explicit empty `/sessions/upcoming`). Storybook stories for every new
  component and state; `storybook build` passes.
- **MSW / e2e** (`e2e/mocks/handlers/sessions.ts`): `/mine` and `/joined` replaced by `/upcoming` and
  `/history` with the real contract (real `page`/`size`, the two 400s, `viewerZoneId` bucketing, `before`
  cursor). Faithful participation: seeded JOINED rows for `mockSession` (creator), `mockGroupSession`,
  `mockOwnedGroupSession`, `mockCancelledSession`; the create handler simulates a standalone creator's
  auto-JOIN. New `mockPreparingSession` fixture, new `historyVolume` override.
  `matches-journey.spec.ts`: steps 3/5/5b/11 rewritten, new step 5d, new separate History-pagination test.
  `app-session-detail-modal.spec.ts`: new `preparing` state (×3 breakpoints). `E2E_OVERVIEW.md` updated.

### Key decisions and non-obvious constraints
- **`HistoryDateSessions` is a deliberate, narrow exception to "components are presentational".** The number
  of History date rows is unbounded and TanStack Query has no infinite counterpart of `useQueries`, so
  `useDiscoverDateSections`' unrolled fixed-slot trick can't scale. `HistorySection` mounts the connected
  child only while a row is expanded (mounting *is* the laziness) via a `renderDateSessions` render prop,
  keeping `HistorySection` itself fully presentational. Sign-off given at plan approval.
- **Faithful MSW cost:** the fixture user now starts JOINED on four sessions, and an un-joined group session
  is unreachable from the list (real behavior) — so the journey no longer "joins the session you created"
  and leaving a session removes its card. Chosen over an approximating mock (user decision) so the mock
  matches the contract; the rail-dependent Home/Groups/Friends/Profile journeys needed **no** assertion
  changes.
- **`mockPreparingSession` is Badminton, not Pickleball** — the rail applies the sport filter *before* its
  cap, and `home-feed-journey` asserts the Pickleball-filtered rail shows exactly 2 cards; a Pickleball
  fixture made it 3 (caught by the first full e2e run).
- **Behavior change vs. the fan-out (accepted):** a group session the caller hasn't joined, and a standalone
  session they created then left, no longer appear in "My sessions" or the rail.
- **Pre-existing staleness fixed in passing:** three `app-session-detail-modal` states (discussion,
  approval-queue, cancelled) targeted Pickleball sessions without switching off `/matches`' default
  Badminton pill (stale since CLIENT-SESSION-29 dropped "All") — they now switch pills.
- **Deviations from the approved plan:** none in design. Two things surfaced during the build and were handled
  inline: the `PREPARING`-fixture sport (above) and the `App.test.tsx` catch-all.

### Verification
- `tsc -b` clean; ESLint on `src`/`e2e`: 0 errors (2 pre-existing warnings in `SessionStartTimePicker.tsx`,
  untouched); Vitest **197 files / 1482 tests passed**; `storybook build` succeeds.
- **Real backend** (dev Postgres, backend SESSION-43 merged code): every request shape the client sends
  returns 200 with the DTO shapes the types mirror — `/upcoming` with and without `sportId`,
  `/history?dateCount=20&sportId&viewerZoneId` (+ `before`), `/history?date=…&sportId&viewerZoneId&page&size`
  (paged, `last`/`number` present), an unknown `sportId` → empty; and `/upcoming` **with**
  `viewerZoneId` → 400 (why it isn't sent). Contract check via minted token, not a logged-in browser
  session (no known dev credentials) — the UI itself was exercised by Playwright below.
- **E2E:** `e2e` project **87 passed, 0 failed** (1.4 min, no retries) — includes the rewritten
  `matches-journey` steps, the new step 5d and the new History pagination test, and the untouched
  `home-feed-journey` (Pickleball-filtered rail still 2 cards). `E2E_OVERVIEW.md` updated for the added/
  changed cases.
- **Visual-regression expectation:** baselines **do** legitimately change, so a failing `visual-regression`
  run is expected until the `update-baselines` GitHub dispatch regenerates them (Windows can't). (1) Three
  **new** files, `session-detail-preparing-{375,768,1280}.png` (the `PREPARING` creator state). (2) Existing
  baselines whose content changes because the fixture user now holds seeded JOINED rows (participant count
  0→1, and card action buttons Join→Leave / none): `session-detail-discussion-*`,
  `session-detail-approval-queue-*`, `session-detail-cancelled-*`, plus — where the rail is in frame — the
  full-page `home-feed-*`, `groups-*` and `profile-*` baselines (list to be confirmed by the dispatch).
  `session-detail-already-joined-*` (same dialog, reached by seed instead of a live join),
  `-not-joined-*`, `-invited-*`, `-requested-*` and every other baseline (create-session, notification-bell,
  post-modal, sport-*, reactivate-*) are expected byte-identical. **What I ran:** the changed
  `app-session-detail-modal.spec.ts` on this Windows host — all 24 instances reach their
  `toHaveScreenshot` step (setup and assertions pass; 21 fail the Windows font-rendering noise floor, 3
  fail as new/missing baselines) — and I eyeballed the rendered `preparing` frame (correct). I did **not** do
  the stash-and-rerun noise-floor proof: the noise floor was already recorded as wholesale on this host
  (CLIENT-SESSION-29: 111/111 fail identically), so it cannot separate signal here. The Windows-rendered
  `preparing` PNGs Playwright wrote were deleted rather than committed.

---

🤖 Generated with [Claude Code](https://claude.com/claude-code)
