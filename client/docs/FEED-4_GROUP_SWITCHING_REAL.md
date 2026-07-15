# FEED-4 · Group switching (real)

**Status:** `DONE` (2026-07-15) · **Type:** Integration · **Dependency:** FEED-0 · **Spec:** AUTH/FEED
epic § FEED-4, substantially expanded via design discussion before implementation (see below)

## Design (as approved)

The epic's spec is minimal: replace `GroupContext`'s manual `fetchUserGroups` with
`useUserGroups(currentUser.id)`, and move "which space is selected" (personal feed vs. a specific
group) into UI-only Zustand state. It intentionally leaves the actual switcher UI unscoped — that
was worked out in a design conversation before implementation, and the result diverges substantially
from the epic's implicit assumption (an inline control on Home Feed):

**UI shape (user decisions, in order):**
1. Not an inline pill row on Home Feed — the switcher lives on its own **Groups page**, reached via
   NavTabs' existing "Groups" destination (previously a `ComingSoonPage` stub). Rationale discussed:
   a dropdown scales better than pills for an unbounded group list, but groups are 1:1 with a sport
   (`Group.sportId`), so filtering the switcher by the active sport bounds it to ~2-3 groups per
   sport — small enough for one-click pills, no dropdown needed for *selection*.
2. The Groups page **inherits `activeSport` from Home Feed** (shared Zustand state) and remains
   switchable from either page — one source of truth, not a read-only inherited value.
3. Selecting a different sport **always resets the group selection back to "All"** — groups are 1:1
   with a sport, so a previously selected group under a different sport doesn't apply.
4. "All" on the Groups page shows every joined group across all sports (not filtered), consistent
   with "All" meaning "no sport filter" everywhere else in the app.
5. Zero joined groups for the active sport → **"Join Group" / "Create Group" render as two buttons**.
   One or more joined groups → those two actions **collapse into a right-aligned "..." dropdown**
   instead, since they're secondary once there's something to switch between. Both are no-ops until
   FEED-5 wires the real modals (same "affordance exists, destination doesn't yet" pattern as
   HF-3/HF-4/HF-7).
6. **No post composer on "All"** — there's no single group to attribute a new post to. The composer
   only renders when a specific group is selected.

**Data layer**
- `app/feedSpaceStore.ts` (new) — `{ activeSport, selectedGroupId, setActiveSport, selectGroup }`.
  Bundles both fields in one store (not two) so `setActiveSport` can enforce "sport switch always
  clears the group selection" in a single place, rather than relying on every caller to do both.
  `activeSport` was promoted here from `HomeFeedPage`'s local state — the Groups page needs it too,
  per `client/CLAUDE.md`'s cross-page state rule ("promote when a second page needs it").
- `shared/hooks/useSportProfiles.ts` (new) — small mock-backed hook (`{ data, isLoading, isError }`)
  extracted from `home-feed/mockData.ts`'s `mockSportProfiles`, since both Home Feed and the Groups
  page need the same sport-profile list for their `SportSwitcher`. Named to match SPORT-1's planned
  real hook of the same name — SPORT-1 swaps only the internals, same shape, no consumer changes.
- `features/groups/useGroupsPageData.ts` (new) — mirrors `useHomeFeedData`'s single-data-boundary
  shape. `groups`: `useUserGroups(currentUserId)`'s result filtered to `activeSport` via the
  existing `SPORT_ID_BY_KEY` map (same client-side filtering idiom `Feed.tsx` already uses for
  posts). `posts`: `useGroupFeed(selectedGroupId)` when a group is selected; on "All", no aggregate
  "all my groups" endpoint exists on the backend, so it reuses `usePersonalFeed()` (which already
  blends in `GROUP_POST`s from sport-matched groups per its own doc comment) narrowed client-side to
  just `GROUP_POST` entries matching the active sport. `createPost` no-ops when `selectedGroupId` is
  null (safety net — the page hides the composer in that state, this isn't the primary guard).
- `usePersonalFeed(enabled = true)` — added an `enabled` param (mirrors `useGroupFeed`'s existing
  one) so the Groups page's "All" state and a specific-group state don't both fetch at once.

**Components**
- `features/groups/components/GroupSpaceSwitcher.tsx` (new) — "All" pill + one pill per group
  (ramp-colored by the *group's own sport*, not a group-specific color — groups don't carry one),
  then either the two buttons or the "..." menu per decision #5 above.
- `features/groups/GroupsPage.tsx` (new) — assembles `SportSwitcher` + `GroupSpaceSwitcher` +
  conditional `CreatePostForm` + `Feed` + `CommentSection`, same structure as `HomeFeedPage`.

**Cross-page component promotion** (mechanical consequence of reusing Home Feed's post/comment UI on
the Groups page, not a separate design decision): `Feed`, `PostCard`, `CreatePostForm`,
`CommentSection`, `CommentItem` moved from `features/home-feed/components/` to
`shared/components/` (git mv, no internal changes — all their imports were already absolute paths).
`useCommentsData.ts` moved from `features/home-feed/` to `features/feed/`, alongside the feature's
other reusable data hooks. Storybook titles for the moved components changed from `HomeFeed/*` to
`Shared/*`.

**Fixture fix (test infra, not app code):** `e2e/mocks/fixtures.ts`'s `mockGroup.sportId` was `1`
(Badminton) — never matched any of the app's 3 known sports (football/basketball/tennis), despite
the group being named "Friday Night Football" and its `mockGroupPost` fixture carrying `sportId: 5`
(Soccer). This is the first ticket to filter groups by `sportId` at all, so the mismatch was latent
until now — fixed to `5` so the fixture actually represents what it claims to.

This is exactly what was built — the UI shape diverged substantially from the epic's implicit
assumption (as intended; that assumption was never an approved design, just the epic's placeholder
framing), but there was no divergence between the design approved in conversation and what shipped.

## What was built

| File | Change |
|---|---|
| `app/feedSpaceStore.ts` | New — shared `activeSport`/`selectedGroupId` Zustand store |
| `app/feedSpaceStore.test.ts` | New — reset-on-sport-switch invariant, selection behavior |
| `shared/hooks/useSportProfiles.ts` | New — mock-backed, `{data,isLoading,isError}`, SPORT-1's eventual name |
| `shared/hooks/useSportProfiles.test.ts` | New |
| `features/feed/hooks/usePersonalFeed.ts` | Added `enabled` param |
| `features/groups/useGroupsPageData.ts` | New — Groups page's data boundary |
| `features/groups/useGroupsPageData.test.tsx` | New — sport-filtered groups, feed source switching, createPost groupId targeting/no-op |
| `features/groups/components/GroupSpaceSwitcher.tsx` | New |
| `features/groups/components/GroupSpaceSwitcher.stories.tsx` | New |
| `features/groups/components/GroupSpaceSwitcher.test.tsx` | New |
| `features/groups/GroupsPage.tsx` | New |
| `features/home-feed/HomeFeedPage.tsx` | `activeSport` now reads/writes `feedSpaceStore` instead of local state |
| `features/home-feed/useHomeFeedData.ts` | `sportProfiles` now sourced from `useSportProfiles()` |
| `features/home-feed/mockData.ts` / `.test.ts` | `mockSportProfiles` removed (moved) |
| `App.tsx` | `/groups` now renders `GroupsPage` instead of `ComingSoonPage` |
| `App.test.tsx` | Two new assembled-page tests for `/groups` |
| `shared/components/{Feed,PostCard,CreatePostForm,CommentSection,CommentItem}.*` | Moved from `features/home-feed/components/` (git mv) |
| `features/feed/useCommentsData.ts`/`.test.tsx` | Moved from `features/home-feed/` (git mv) |
| `e2e/mocks/fixtures.ts` | `mockGroup.sportId`: `1` → `5` (fixture correctness fix) |

## Verified

- `tsc -b --force`: clean.
- `eslint .`: clean.
- `pnpm test`: 51 files / 232 tests, all passing.
- Live-verified in a real running browser (Playwright against the `e2e` project, MSW-backed, no real
  backend needed since this ticket is purely client-side state/UI — the endpoints themselves already
  existed and are exercised by the moved components' existing test coverage): navigated to `/groups`
  as an authenticated user, confirmed — "All" shows the one fixture group with no composer; switching
  to Football (the group's sport) keeps the group visible and collapses Join/Create into the "..."
  menu (contents confirmed by opening it); selecting the group reveals the composer; switching to
  Basketball (zero groups for that sport) shows the two buttons instead, hides the composer again,
  and correctly marks Basketball (not the previous Football) as the active `aria-pressed` sport pill.
  Screenshots reviewed directly, temporary verification spec deleted after use (not committed).

## Deltas for later tickets

- **FEED-5** (CreateGroupModal + JoinGroupModal) wires the real destinations behind
  `GroupSpaceSwitcher`'s `onCreateGroup`/`onJoinGroup` — currently no-ops on both the button and menu-item
  code paths.
- **`useGroupsPageData`'s "All" posts are a client-side derivation of `usePersonalFeed()`**, not a
  dedicated endpoint — if a future backend ticket adds a real "posts from all my groups" aggregate
  endpoint, this hook should switch to it instead of the `postType === 'GROUP_POST'` filter.
- **No E2E or visual-regression coverage was added for the Groups page** — deliberately out of scope
  per the approved design discussion (FEED-10 covers the feed/groups E2E journey; visual-regression
  for a new page follows HF-10a's pattern as its own ticket, same as FEED-11 for the comment modal).
  The Playwright verification run in this ticket was a manual one-off, not committed.
- **`Group` has no color/ramp of its own** — `GroupSpaceSwitcher`'s pill badges use the group's
  *sport's* ramp (via `sportIdMap.sportKeyForId` + `sportsByKey`). If a future design wants
  per-group colors, that's a new field, not a reuse of the sport ramp.
- Storybook: moved components' stories are now under the `Shared/` title namespace, not `HomeFeed/`
  — any doc/screenshot referencing the old Storybook path is stale.
