# CLIENT-SESSION-7 · Upcoming rail create/join CTAs + create-session hook extraction

**Status:** `DONE` (2026-08-06) · **Type:** Feature · **Dependency:** CLIENT-SESSION-2 (`DONE`),
CLIENT-SESSION-6 (`DONE` — Discover exists for real now) · **Filed:** 2026-08-03, split from
CLIENT-SESSION-2's original scope at close-out · **Spec:**
`CLIENT-SESSION-2_RAIL_CTAS_AND_CREATE_REDESIGN.md` § "Point 1" (original plan), amended below.

## Approved design (restated)

Point 1's original plan: `UpcomingMatches`'s empty state drops "for this sport" from its copy
and gains two controlled CTAs, `onCreateMatch`/`onJoinMatch`. `onCreateMatch` opens
`CreateSessionModal`, extracted out of `useMatchesPageData` into a standalone hook so
`HomeFeedPage`/`GroupsPage`/`FriendsPage`/`MatchesPage` share one create-session implementation.
`onJoinMatch` was originally specced as `navigate('/matches')`, "superseded once SESSION-4 ships a
real discover destination" — which had already happened by the time this ticket was picked up
(CLIENT-SESSION-6 shipped `/matches`'s two-panel Discover/My-sessions layout). `FriendsPage` gets
`ModalAnchorProvider` (the only rail-hosting page that didn't have one).

**Scope amendment at pickup:** asked directly whether `onJoinMatch` should navigate to `/matches`
or open a dedicated Discover modal — chose the modal. This added three new pieces not in the
original plan: `SessionDiscoverPanel` (Discover's search/filter/grid UI, extracted out of
`MatchesPage` so the modal and the full page never drift), `SessionDiscoverModal` (a `Dialog`
wrapping that panel), and `useDiscoverModalData` (a self-contained hook owning that modal's state
plus a session-detail sub-slice for whichever session the caller selects from it).

## What was built

**Shared extraction:**
- `discoverSearch.ts` — `filterDiscoverSessions()`, the search-box filtering logic pulled out of
  `useMatchesPageData` so both it and `useDiscoverModalData` use the exact same behavior.
- `components/SessionDiscoverPanel.tsx` — the search bar/mode select/inert filter pills/results
  grid, pulled out of `MatchesPage`'s inline JSX. `MatchesPage` now renders it via props instead
  of owning the markup directly (behavior-identical — verified via the pre-existing `MatchesPage`/
  `useMatchesPageData` test suites, unchanged and still green after the extraction).
- `useCreateSessionModalData.ts` — the create-session slice (modal state, favorites dropdown,
  location picker wiring, invite-friends search, the create mutation) pulled out of
  `useMatchesPageData` verbatim. `useMatchesPageData` now calls this hook and spreads its result
  into its own return object under the same field names, so `MatchesPage.tsx` needed zero changes.

**New for the Discover modal:**
- `useDiscoverModalData(sportId: number | undefined)` — open/close state, search text/mode,
  `useDiscoverSessions`, and a session-detail slice (selected session, participants, join/leave).
  `canManage` is hardcoded `false`: `GET /sessions/discover` is standalone-only and already
  excludes sessions the caller created, so a session reached from here can never be one the
  caller manages — the cancel/approval-queue props handed to `SessionDetailModal` are inert stubs
  (`SessionDetailModal` never renders that UI when `canManage` is false, so this is safe, not
  just unused).
- `components/SessionDiscoverModal.tsx` — a `Dialog` titled "Discover sessions" wrapping
  `SessionDiscoverPanel`. Selecting a session closes this modal and the host page opens
  `SessionDetailModal` for it (`useDiscoverModalData.onViewDetails` does both in one call) — the
  same "close one Dialog, then open the next" stacking pattern `HashtagPostsModal`/`CommentSection`
  already established, not two Dialogs nested inside each other (the pattern that broke
  `CreateSessionModal`'s earlier favorites-dropdown/wheel-picker attempts, per CLIENT-SESSION-2's
  and CLIENT-SESSION-5's write-ups).

**`UpcomingMatches`:** empty-state copy is now `"No upcoming matches."`; two new required props,
`onCreateMatch`/`onJoinMatch`, render as `Button` (`outline`/`primary`) in the empty-state branch
only — the populated list is unchanged.

**Page wiring** (`HomeFeedPage`/`GroupsPage`/`FriendsPage`, all three symmetric): each calls
`useCreateSessionModalData()` and `useDiscoverModalData(activeSportId)` once, renders its own
`CreateSessionModal`/`SessionDiscoverModal`/`SessionDetailModal` instances, and wires
`UpcomingMatches`'s two new props to `openCreateModal`/`openDiscoverModal`. `activeSportId` scopes
the modal's Discover query to whatever sport pill is currently active on that page —
`SPORT_ID_BY_KEY[activeSport]`, or `undefined` for `'all'`. `FriendsPage` has no sport switcher at
all, so it always passes `undefined` (`useDiscoverSessions` already treats `undefined` as "every
active sport" — the backend's own default when the param is omitted). `FriendsPage` also gained
`ModalAnchorProvider`, anchored to its own `sr-only` `<h1>` rather than a pill row it doesn't have
— keeps the modals positioned just under the TopBar/NavTabs shell like every other page's modals,
with zero new visible UI.

## Non-obvious constraints / decisions

- **Why `useCreateSessionModalData` takes no arguments:** every piece of its state is scoped to
  one open/close cycle of the modal — `sportsByKey`/`activeSport` (needed by `CreateSessionModal`
  itself) stay host-page props, since each page already computes its own `sportsByKey` and the
  prop was already optional (`activeSport?: SportKey | 'all'`, with a comment anticipating
  `FriendsPage` not having one — written back in CLIENT-SESSION-2).
- **Why `useDiscoverModalData` isn't merged into `useCreateSessionModalData`:** they're opened by
  two different buttons and have no shared state — merging them would just mean every host page
  pays for both hooks' work whenever either modal opens.
- **Why `useDiscoverModalData` duplicates a small slice of `useMatchesPageData`'s session-detail
  logic instead of sharing a hook:** `useMatchesPageData`'s detail-dialog logic also carries
  group-management concerns (`canManageSelected` via the caller's group role, the approval queue)
  that structurally never apply to a Discover-sourced session. Sharing would mean threading unused
  group data into every rail-hosting page just to satisfy a hook signature — the ~15-line
  duplication was judged cheaper than that abstraction.

## Divergence from the original plan: no e2e step

Point 1's plan suggested an e2e step for "create from the Home Feed rail." At pickup, every sport
in the existing e2e fixture set (`home-feed-journey.spec.ts`/`matches-journey.spec.ts` — football/
basketball/tennis) already has ≥1 upcoming match, so `UpcomingMatches`'s empty-state branch
(where the new CTAs live) is unreachable there without restructuring shared fixtures in a way
that risks breaking other specs' match-count assertions. Covered instead via Vitest:
- `UpcomingMatches.test.tsx` — the CTAs render only in the empty state and call their own props.
- A new test each in `HomeFeedPage.test.tsx` and `FriendsPage.test.tsx` — forces zero upcoming
  matches via the existing GET-mock fixtures, clicks both CTAs, asserts the right dialog opens
  (`"Create your session"` / `"Discover sessions"`).
- `GroupsPage` has no existing page-level test file (only its data hooks are tested) — its wiring
  is structurally identical to `HomeFeedPage`'s, verified by typecheck + the shared hooks' own
  test coverage, but not exercised end-to-end. Worth a `GroupsPage.test.tsx` in a future ticket if
  this page starts accumulating more page-level behavior worth locking down.
- New `SessionDiscoverPanel.test.tsx`/`.stories.tsx` and `SessionDiscoverModal.test.tsx`/
  `.stories.tsx` cover the two new components directly. New `discoverSearch.test.ts` covers the
  extracted filter helper.

## Verification

- `pnpm exec tsc -b` — clean.
- `pnpm exec vitest run` — 787/787 passing (full suite; no regressions in the extracted/refactored
  `useMatchesPageData`/`MatchesPage` tests).
- `pnpm lint` — 0 errors (2 pre-existing warnings in an unrelated file).
- `pnpm build` — clean production build.
- **Not done: a live browser walk.** The Chrome browser-automation extension was not connected
  this session (same limitation noted in CLIENT-SESSION-6's summary) — verification relied on the
  build/typecheck/lint/test signals above rather than a manual click-through against the running
  dev server + backend. Worth a manual pass before the next release, same as CLIENT-SESSION-2's
  own outstanding "not re-verified against the new modal layout" note.

## Files created or modified

- New: `discoverSearch.ts`, `discoverSearch.test.ts`, `useCreateSessionModalData.ts`,
  `useDiscoverModalData.ts`, `components/SessionDiscoverPanel.tsx` (+ `.test.tsx`/`.stories.tsx`),
  `components/SessionDiscoverModal.tsx` (+ `.test.tsx`/`.stories.tsx`)
- Modified: `useMatchesPageData.ts` (create-session slice extracted, discover filter extracted),
  `MatchesPage.tsx` (renders `SessionDiscoverPanel` instead of inline JSX),
  `shared/components/UpcomingMatches.tsx` (+ `.test.tsx`/`.stories.tsx`),
  `features/home-feed/HomeFeedPage.tsx` (+ `.test.tsx`),
  `features/groups/GroupsPage.tsx`,
  `features/friends/FriendsPage.tsx` (+ `.test.tsx`)
