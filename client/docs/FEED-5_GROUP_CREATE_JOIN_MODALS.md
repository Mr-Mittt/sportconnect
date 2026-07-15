# FEED-5 · CreateGroupModal + JoinGroupModal (real)

**Status:** `DONE` (2026-07-15) · **Type:** Integration · **Dependency:** FEED-4 · **Spec:** AUTH/FEED
epic § FEED-5, substantially expanded via a design conversation before implementation (see below)

## Design (as approved)

The epic's spec: wire group creation (`POST /api/groups`) and join requests
(`POST /api/groups/join-requests`) to the real endpoints, with a group appearing in the user's list
immediately and a join request showing a clear pending state. Two rounds of scoping happened before
implementation:

**Round 1 — backend reality check.** Verified against the real `GroupController`/`GroupServiceImpl`,
not assumed:
- **Joining is by group NAME, not id** — `CreateJoinRequestRequest` has no `groupId` field at all
  (`GroupServiceImpl.findByGroupName`). This meant JoinGroupModal needed a way to find a group's exact
  name first — the backend already has `GET /api/groups/public?sportId&keyword` built for exactly this.
- `CreateGroupRequest` requires `sportId`/`groupName`; `description`/`isPrivate` are optional
  (`isPrivate` has no server-required-validation but is still always sent, defaulting to `false`).
- `JoinRequestResponse.status` is a plain string (`"pending"|"accepted"|"declined"`), and
  `GET /api/groups/join-requests/user/{userId}` is already pending-only server-side.

**Round 2 — user decisions on the actual UI:**
1. JoinGroupModal: search/browse public groups (not a plain "type the exact name" field) — matches
   what `GET /groups/public` is built for.
2. CreateGroupModal fields: name, sport, description, private toggle. No avatar/cover URL fields —
   no photo-upload infrastructure exists anywhere else in the app yet (`CreatePostForm`'s Photo
   button is a no-op too).
3. Sport prefill: opening either modal while a specific sport is active on the Groups page locks the
   form to that sport; "All" shows a sport picker instead.
4. **Additional requirements added mid-ticket (before implementation started):**
   - The Groups page's right rail (UpcomingMatches → TrendingHashtags → GroupBroadcasts) should be
     identical to Home Feed's — pure layout/data parity, not a group-scoped variant.
   - The zero-groups "Join Group"/"Create Group" buttons should use the same dashed-pill style as
     `SportSwitcher`'s "Add sport" pill, with a search icon (Join) / plus icon (Create) — the
     labels stay "Join Group"/"Create Group" (a mid-conversation rename to "Find Group" was walked
     back).
   - The "..." dropdown menu items (shown once groups exist) also get those icons, staying plain
     `DropdownMenuItem` rows (not dashed pills — that shape only applies to the standalone buttons).

## What was built

**Rail relocation (prerequisite for the right-rail requirement)** — same pattern FEED-4 already used
for `sportProfiles`, now extended to the other two rail datasets since the Groups page needed them
too:
- `UpcomingMatch`/`TrendingHashtag`/`GroupBroadcast` types moved `home-feed/types.ts` →
  `shared/types/rail.ts` (re-exported from the old location, same as HF-2's `SportKey`/`SportProfile`
  precedent).
- `hoursAgo`/`hoursFromNow` moved to `shared/lib/mockClock.ts`.
- Three new mock-backed hooks: `shared/hooks/{useUpcomingMatches,useTrendingHashtags,useGroupBroadcasts}.ts`.
- `home-feed/mockData.ts` and its test **deleted** — everything in them had moved out (sportProfiles
  in FEED-4, these three in this ticket).
- `UpcomingMatches`/`TrendingHashtags`/`GroupBroadcasts` components (+ stories/tests) moved
  `features/home-feed/components/` → `shared/components/` (git mv), Storybook titles `HomeFeed/*` →
  `Shared/*`.
- `useHomeFeedData.ts`/`useGroupsPageData.ts` both now source `upcomingMatches`/`hashtags`/`broadcasts`
  from the three shared hooks. `GroupsPage.tsx` restructured into the same two-column grid as
  `HomeFeedPage` (`Feed` left, rail right).

**GroupSpaceSwitcher styling** — zero-groups state: two dashed-pill buttons (`DashedPillButton`, same
markup/classes as `SportSwitcher`'s "Add sport" pill) with `IconSearch`/`IconPlus`. Dropdown menu
items: same icons prefixed to the existing `DropdownMenuItem` text.

**New types** (`features/feed/types.ts`): `GroupSearchResult`, `JoinRequestStatus`, `JoinRequest`,
`CreateGroupPayload`, `JoinRequestPayload`, `MIN_GROUP_NAME_LENGTH`/`MAX_GROUP_NAME_LENGTH`/
`MAX_GROUP_DESCRIPTION_LENGTH` (mirroring `CreateGroupRequest`'s real `@Size` constraints).

**New hooks** (`features/feed/hooks/`):
- `useCreateGroup(currentUserId)` — mutation; `onSuccess` prepends the new group directly into
  `feedKeys.userGroups(userId)`'s cache (same `prependPostToFeedCache`-style pattern as FEED-3), so
  it's selectable immediately without waiting on the background invalidate+refetch.
- `useJoinGroup()` — mutation; `onSettled` invalidates `feedKeys.all`.
- `usePublicGroups(sportId, keyword, enabled = true)` — query wrapping `GET /groups/public`.
- `useJoinRequests(userId)` — query wrapping `GET /groups/join-requests/user/{userId}`.
- `queryKeys.ts` gained `publicGroups`/`joinRequests`.

**Architecture note — presentational refactor mid-ticket.** The first pass had `CreateGroupModal`/
`JoinGroupModal` calling their data hooks directly. That broke Storybook testability and diverged
from this codebase's established "presentational and controlled" convention (every other component —
`CommentSection`, `PostCard`, `Feed` — receives data/callbacks as props from a page-level hook, never
calls a TanStack Query hook itself). Refactored before finishing the ticket:
- `CreateGroupModal` — presentational; owns only its own transient form-field state (name, sport,
  description, private — same "owns local UI state" precedent as `CreatePostForm`'s textarea).
  Receives `onSubmit`/`isSubmitting`/`isError` as props; `GroupsPage` owns the actual
  `useCreateGroup()` call.
- `JoinGroupModal` — fully presentational, zero local state. New `features/groups/useJoinGroupModalData.ts`
  (same role/shape as `useCommentsData`) owns the search text and composes `usePublicGroups`/
  `useJoinRequests`/`useJoinGroup`, returning plain values/callbacks `GroupsPage` threads down as props.
- Both modals reset per-open via `GroupsPage` remounting them with a changing `key` prop (bumped only
  on open, not close) rather than an effect calling `setState` — React's own guidance flagged the
  effect approach (`react-hooks/set-state-in-effect`) as causing an extra cascading render.

**New UI primitive**: `shared/ui/select.tsx` — minimal native `<select>` styled to `Input`'s tokens
(no Radix Select needed for a handful of sport options).

**MSW** (`e2e/mocks/handlers/groups.ts`, new file) — stateful fake backend for all 4 endpoints, same
`postsState`-style pattern as `feed.ts`. `GET /groups/user/:userId` **moved** from `feed.ts` into this
file and made stateful too — it was static before, which would have clobbered `useCreateGroup`'s
optimistic cache write the moment the mutation's background invalidate refired that GET.
`e2e/mocks/fixtures.ts` gained `mockPublicGroup` (a group the fixture user hasn't joined, distinct
sportId from `mockGroup` so sport-filtered search has something real to filter) and `mockJoinRequest`
(available for FEED-10, unused by this ticket's own tests).

## Verified

- `tsc -b --force`: clean. `eslint .`: clean.
- `pnpm test`: 60/60 files, 268/268 tests (up from 51/232 at FEED-4's close).
- Live-verified in a real browser via a temporary Playwright script (deleted after use, same approach
  as FEED-4): confirmed the right rail matches Home Feed exactly; Football (has a group) shows the
  "..." menu with both icons; Basketball (zero groups) shows the two dashed-pill buttons; created
  "Court Kings" under Basketball — it appeared immediately, ramp-colored, auto-selected, composer
  visible, no refetch needed; searched "Hoopers" in Join Group, found "Riverside Hoopers", requested
  to join, row transitioned to "Pending" in place without a reload.
- One real bug caught by this verification: `usePublicGroups` had no `enabled` gate, so
  `useJoinGroupModalData` kept fetching in the background even while the modal was closed — fixed by
  adding an `enabled` param (mirroring `usePersonalFeed`'s existing one).

## Deltas for later tickets

- **FEED-6/FEED-7** should be aware the rail hooks they're de-mocking (`useTrendingHashtags`,
  `useGroupBroadcasts`) now live in `shared/hooks/`, not `home-feed/` — swap the internals there, no
  consumer changes needed on either Home Feed or Groups page.
- **FEED-10**'s E2E journey can use `mockPublicGroup`/`mockJoinRequest` (already in `fixtures.ts`) for
  the join-request step, and should extend `groupHandlers` if it needs the owner/admin
  accept/decline endpoints (`PUT /groups/join-requests/{id}/accept|decline`), which exist on the
  backend but weren't needed by this ticket's requester-side scope.
- **No E2E or visual-regression spec was added** for the create/join flows — deliberately out of
  scope, same reasoning as FEED-4's own note (FEED-10 covers the journey; visual-regression for the
  Groups page is a separate future ticket).
- `GroupSearchResult`/`JoinRequest` have no color/ramp of their own, same as `Group` — any future UI
  showing them should reuse the sport-ramp-via-`sportIdMap` pattern, not invent a new color source.
