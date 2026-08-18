# FEED-7 · GroupBroadcasts (real)

**Status:** `DONE` (2026-07-16) · **Type:** Integration · **Dependency:** FEED-0, HF-6 · **Spec:**
AUTH/FEED epic § FEED-7, substantially expanded via design discussion before implementation

## Design (as approved)

The epic's spec: de-mock HF-6's `GroupBroadcasts` rail card via `useActiveBroadcasts()`, and add an
owner/admin-only "create broadcast" action using `CreatePostRequest` with `postType:
GROUP_BROADCAST` (`broadcastEndTime` optional, server defaults to now+24h). No
`design-reference-*.html` covers the creation UI (same situation FEED-2/FEED-6 hit) — resolved via
a design conversation:

1. **"Create broadcast" is a switcher inside `CreatePostForm`**, next to the "Tag sport" button —
   not a separate button or modal. Visible only when the caller is owner/admin of the currently
   selected group. Defaults off.
2. **Active-broadcast cap**: the backend allows only one active broadcast per group
   (`PostRepository.existsActiveGroupBroadcast`, 400 on a second `POST`). Rather than block the
   switcher, submitting with it on while one is already active opens a confirmation dialog offering
   to **update** the existing broadcast instead of creating a second one.
3. **Comment button disabled on broadcast posts, "for now"** — like stays fully functional.
4. **The right rail's broadcast rows stay unwired** (`onBroadcastClick` remains a no-op) — no click
   destination is being built for it in this ticket.

This is exactly what was built.

## What was built

**Data layer**
- `shared/hooks/useGroupBroadcasts.ts` — swapped the mock array for a thin adapter over
  `features/feed/hooks/useActiveBroadcasts` (real `GET /api/posts/broadcast`, already existed from
  FEED-0) + `useUserGroups` (already mounted elsewhere with the same query key — TanStack Query
  dedups, no extra network call) to resolve each broadcast's `groupName`/`groupInitials`/
  `colorRamp` (a `Post` only carries `groupId`; the ramp comes from the group's own sport, same
  convention `GroupSpaceSwitcher` already uses since a group has no color of its own). A broadcast
  whose `groupId` matches none of the caller's groups is dropped rather than crashing (SPORT-1's
  defensive precedent).
- `shared/types/rail.ts` — `GroupBroadcast.id`/`.groupId` changed from `string` to `number` to
  match the real `Post` fields this is now built from.
- `features/feed/hooks/useUpdatePost.ts` (new) — wraps `PUT /api/posts/{postId}`. Splices the
  server-returned post into every mounted Post-feed query on success (same `updatePostInFeedCaches`
  helper FEED-1's like/unlike mutations use), background-invalidates `feedKeys.all` on settle for
  the broadcasts rail (a plain `useQuery`, not `InfiniteData`-shaped, so the direct splice can't
  reach it). **Backend quirk documented, not fixed** (client-only ticket): the update endpoint sets
  `content`/`locationName`/`sportId` unconditionally from the request body — omitting a field nulls
  it out server-side, it isn't a partial patch. The broadcast-update flow echoes back the existing
  values for the two fields it isn't changing.
- `useGroupsPageData.ts` gained: `canBroadcast` (derived from the selected group's
  `currentUserRole` — already on the `Group` object from `useUserGroups`, no new permission-check
  call), `activeBroadcastForSelectedGroup` (the raw `Post`, from a second `useActiveBroadcasts()`
  call — dedups with the rail hook's — needed for its `locationName`/`sportId`/`visibility`, which
  the rail-mapped `GroupBroadcast` shape doesn't carry), `createPost` extended to accept
  `options?: { asBroadcast: boolean }`, and `updateBroadcast(content, options?)` wrapping the new
  mutation against `activeBroadcastForSelectedGroup`.

**Components**
- `shared/components/CreatePostForm.tsx` — new `canBroadcast?: boolean` prop; local
  `isBroadcastOn` state (ephemeral composer UI state, same treatment as `content`, reset on every
  submit) drives a new "Broadcast" toggle (`IconSpeakerphone`) next to Tag sport. `onSubmit`'s
  signature changed to `(content, { asBroadcast }) => void` — existing call sites that only take
  `content` remain valid (TypeScript allows a narrower-parameter function where a wider one is
  expected), so `HomeFeedPage`'s wiring needed no changes.
- `shared/components/PostCard.tsx` — comment button now `disabled` when
  `post.postType === 'GROUP_BROADCAST'`.
- `shared/components/UpdateBroadcastConfirmDialog.tsx` (new) — presentational confirmation dialog,
  shows the existing active broadcast's text, Cancel/Update broadcast actions.

**Page wiring** (`GroupsPage.tsx` only — broadcasts require a specific selected group, which Home
Feed has no concept of)
- New `pendingBroadcastContent: string | null` state (doubles as the confirm dialog's open state,
  same convention as `activeCommentsPostId`).
- `handleSubmitPost(content, { asBroadcast })`: if broadcasting into a group that already has one
  active, stashes the content and opens the confirm dialog instead of calling create.
  `confirmUpdateBroadcast()` calls `updateBroadcast`, closing the dialog on success.
- `CreatePostForm` gets `canBroadcast`; `UpdateBroadcastConfirmDialog` rendered alongside the
  page's other modals.

## Live verification against the real backend (not MSW)

Registered a fresh user via the real registration UI, added a Football sport profile, created a
group (auto-owner), and drove the actual composer:
- "Broadcast" toggle visible (owner) and off by default.
- Created a broadcast — appeared in the group's own feed as a real post, comment button disabled,
  like worked, right rail showed it.
- Submitted a second broadcast while the first was still active — the confirm-update dialog opened
  showing the first message; confirming replaced its content in place (verified in both the main
  feed article and the rail card), and the old text disappeared everywhere.

**Found during verification, not a FEED-7 bug** (a pre-existing, already-documented gap): every
composer-created post gets `sportId: null` (FEED-3's "Tag sport" button is an inert no-op
everywhere), and `Feed`'s own sport filter hides any post without a matching `sportId` under a
specific sport pill (only "All" shows it). This is only reachable in practice by selecting a
specific group whose sport pill isn't "All" — worked around during verification by choosing the
group's sport inside `CreateGroupModal`'s own picker instead of pre-selecting a sport pill first
(which would have reset `selectedGroupId` back to null anyway, per `feedSpaceStore`'s own
sport-switch-clears-group-selection coupling). Not fixed here — already FEED-3's documented scope.

## Verified

- `tsc -b --force`: clean.
- `eslint .`: clean.
- `pnpm test`: 67/67 files, 326/326 tests (up from 310 before this ticket).
- `pnpm exec playwright test --project=e2e`: 29/29 passing (updated
  `home-feed-journey.spec.ts`'s broadcast-count assertions from 2 to 1, matching the real
  `mockBroadcastPost`/`mockGroup` MSW fixture pair).
- Live walkthrough against the real running backend (see above) — full create → confirm → update
  cycle, comment-disabled state, and like all verified working.

## Test fallout fixed

Any test mocking `apiClient.get` for a fixed URL set needed `/posts/broadcast` and
`/groups/user/{id}` branches once the real hook mounts unconditionally on Home Feed/Groups:
`HomeFeedPage.test.tsx` (refactored its growing pile of near-identical inline mocks into a shared
`staticGetResponse()` helper — 5 call sites had drifted into copy-pasted duplication across
FEED-6/FEED-7), `useHomeFeedData.test.tsx`, `useGroupsPageData.test.tsx` (already had a
per-test `handlers` override map; added a default empty-broadcasts fallback), and
`App.test.tsx`'s Home Feed test (previously fell through to a *post*-shaped fallback for any
unmatched URL — would have made `useGroupBroadcasts` crash trying to read `groupName` off a `Post`
it mistook for a `Group`; added explicit empty branches instead).

## Deltas for later tickets

- **HF-18 filed** (visual-regression baselines stale — the broadcasts card now renders 1 real row
  instead of the old mock's 2, on top of HF-17's already-executed causes). Same HF-13..HF-17
  pattern — needs the CI `update-baselines` dispatch, not a local regen.
- **The right rail's broadcast row click stays a no-op** — no ticket currently scopes a destination
  for it (the real interaction point is the broadcast post inside its group's own feed).
- **The composer-created-posts-have-no-sportId gap** (found during this ticket's live
  verification, pre-existing since FEED-3) still needs its own future ticket if "Tag sport" is ever
  wired for real — until then, any post created via any composer only shows under the "All" sport
  filter, not a specific sport pill, on both Home Feed and Groups.
- **No visual-regression coverage exists for `UpdateBroadcastConfirmDialog`** — same "own future
  ticket" precedent already established for `HashtagPostsModal` (FEED-6) and the comment modal
  (FEED-11).

---

### FEED-7 · GroupBroadcasts (real)
**Status:** `DONE` (2026-07-16) · **Type:** Integration · **Dependency:** FEED-0, HF-6 · **Spec:** AUTH/FEED epic § FEED-7 ·
**Summary:** `client/docs/FEED-7_GROUPBROADCASTS_REAL.md`

De-mocks HF-6 via `useActiveBroadcasts()`; adds owner/admin-only "create broadcast" action
(`postType: GROUP_BROADCAST`, server defaults expiry to +24h). The backend also has
`PUT /groups/join-requests/{id}/accept|decline` (owner/admin) available if a future ticket wants
to build the reviewer-side UI — not needed by FEED-5's requester-side scope.

**Deltas (all user decisions, no design-reference-*.html covered this surface):**
- **"Create broadcast" is a switcher inside `CreatePostForm`**, next to Tag sport — not a separate
  button/modal. Visible only when `canBroadcast` (the selected group's `currentUserRole` is
  `group_owner`/`group_admin` — already on the `Group` object from `useUserGroups`, no new
  permission-check call needed). Defaults off; resets to off on every submit, same as the
  composer's `content`.
- **The backend caps each group at one active broadcast** (`existsActiveGroupBroadcast`, 400 on a
  second attempt). Rather than hide/disable the switcher, submitting with it on while the group
  already has one active opens `UpdateBroadcastConfirmDialog` (new component) showing the existing
  message; confirming calls a new `useUpdatePost()` (`PUT /api/posts/{postId}`) against the
  existing broadcast instead of creating a second one.
- **`PostCard`'s comment button renders disabled for a `GROUP_BROADCAST` post**, "for now" — like
  stays fully functional. Applies everywhere `PostCard` renders (only a group's own feed actually
  surfaces broadcasts inline — `findByGroupIdAndIsActiveTrue` has no postType filter — the personal
  feed's `GROUP_POST`-only filter excludes them).
- **The right rail's broadcast rows stay unwired** (`onBroadcastClick` still a no-op) — the real
  interaction point is the broadcast post itself inside its group's feed.
- **`GroupBroadcast.id`/`.groupId` changed from `string` to `number`** to match the real `Post`
  they're built from (same class of fix FEED-1/SPORT-1 made for their own mock→real transitions).

**Found during live verification (not a FEED-7 bug — a pre-existing, already-documented gap):**
composer-created posts never get a `sportId` (FEED-3's "Tag sport" is inert everywhere), so `Feed`'s
own sport filter hides them under any pill except "All". Only reachable in practice by selecting a
specific group whose sport pill isn't "All" — worked around in verification by choosing the group's
sport inside `CreateGroupModal` instead of pre-selecting a sport pill (which would have reset
`selectedGroupId` back to null anyway, per `feedSpaceStore`'s own coupling). Not fixed here — it's
FEED-3's documented scope, not new.

**HF-18 filed** (visual-regression baselines stale — the broadcast card now renders 1 real row
instead of the old mock's 2). Same HF-13..HF-17 pattern.
