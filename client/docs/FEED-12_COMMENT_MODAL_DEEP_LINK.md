# FEED-12 · Comment modal fetches its own post + URL-addressable deep link

**Status:** `DONE` (2026-07-17) · **Type:** Feature · **Dependency:** FEED-2 (`DONE`) · **Origin:**
raised by the user right after FEED-2 merged (PR #32) — new ticket, not in either epic.

## Problem recap

`CommentSection`'s `post`/`sport` props were resolved by `HomeFeedPage`/`GroupsPage` purely by looking
up `data.posts.find(post => post.id === activeCommentsPostId)` against the already-loaded feed cache
(falling back to the hashtag-results cache). Two consequences: the modal could only ever open for a
post the feed had already fetched, and there was no URL that opened directly to a post's comment
thread — no shared link, notification deep link, or refresh-while-open had anywhere to go.

## Approved plan (Phase 3, restated)

1. **Option A for the route**: `/posts/:postId` renders the full `HomeFeedPage` underneath, dialog
   pre-opened — reuses everything, no new dedicated shell component.
2. **Real route with normal history semantics**: opening pushes a history entry; back/forward works
   naturally. Accepted tradeoff, confirmed with the user: on a cold direct-URL load, the page behind
   the dialog is the viewer's own generic Home Feed (via `usePersonalFeed`), not anything contextual
   to the shared post — the modal has focus regardless, so this doesn't matter in practice.
3. **Anonymous viewing is explicitly out of scope** — `/posts/:postId` sits behind the same
   `ProtectedRoute` every other route uses; an anonymous visitor gets the existing generic
   redirect-to-login-then-bounce-back behavior (AUTH-8's step 7), not a new mechanism. Whether a
   shared post should ever be viewable *without* logging in at all is a genuine product question,
   filed separately as **ANON-1** in the new `client/docs/BACKLOG_V1.md` — not answered or built here.
4. **Groups page scoping decision** (surfaced during design, not in the original ticket text): Groups
   page also opens `CommentSection` via its own `activeCommentsPostId`. Routing its opens through
   `/posts/:postId` too would unmount `GroupsPage` (and its selected-group state) on close, landing the
   user on Home Feed instead of back on Groups — a real regression. **Resolved: only Home Feed's
   comment dialog is URL-addressable; Groups page stays local-state-only**, but still adopts `usePost`
   for the same duplicate-fetch-avoidance and correctness benefit.

## What was built

- **`usePost(postId, enabled)`** (`src/features/feed/hooks/usePost.ts`) — `GET /api/posts/{postId}`,
  seeded via TanStack Query's `initialData` from `findPostInFeedCaches` (new, in
  `optimisticFeedUpdates.ts`) so an in-feed open never double-fetches; `staleTime: 30_000` keeps seeded
  data from being immediately treated as stale. `feedKeys.post(postId)` is the new query key.
- **`optimisticFeedUpdates.ts`**: `updatePostInFeedCaches` now also patches `feedKeys.post(postId)`
  directly (it's a plain `Post`, not `InfiniteData`, so the existing `setQueriesData` call couldn't
  reach it) — otherwise liking a post from a cold `/posts/:id` load wouldn't flip until the next
  background invalidate.
- **`useHomeFeedData`/`useGroupsPageData`**: both gain `toggleLikeForPost(post: Post)`, sharing the
  same `useLikePost`/`useUnlikePost` mutation instances as the existing `toggleLike(postId)` but
  deciding like-vs-unlike from an already-resolved `Post` directly, not an internal feed-array lookup.
  Needed because `toggleLike(postId)`'s lookup silently no-ops for a post outside that hook's own feed
  (e.g. reached via a direct link) — a real, verified gap (test: `toggleLikeForPost decides
  like-vs-unlike from the passed post, not an internal lookup`).
- **`CommentSection`**: new `isPostLoading`/`isPostError` props, with dedicated loading-skeleton and
  "Couldn't load this post." states — previously `post === null` rendered nothing, correct only for the
  old instantaneous close-animation case, not a real network fetch that can take real time or fail.
- **`App.tsx`**: `/posts/:postId` added to the existing protected route group, rendering
  `HomeFeedPage`.
- **`HomeFeedPage`**: `activeCommentsPostId` now derives from `useParams()`, not local `useState`.
  Opening: `navigate(`/posts/${id}`)`. Closing: `navigate('/', { replace: true })` — deterministic
  regardless of whether there's a meaningful "back" target (there isn't, on a cold shared-link load).
- **`GroupsPage`**: adopts `usePost` for the same `activeCommentsPost` derivation, no route change.
- **MSW**: `GET /api/posts/:postId` added to `e2e/mocks/handlers/feed.ts` (must stay ordered after
  every literal-segment `/api/posts/*` GET handler — msw matches in array order, and `:postId` would
  otherwise shadow `/api/posts/feed` etc.).

## A real bug found and fixed during live-backend verification (not in the original plan)

Neither `usePost` nor the pre-existing `useComments` set a custom `retry` — TanStack Query's default
(3 attempts, exponential backoff) applied to a 404. Confirmed live against the real backend
(`PostServiceImpl.getPostById`'s `NotFoundException` → genuine 404, not transient): loading a deleted/
nonexistent post's link took **several seconds** before `CommentSection`'s "Couldn't load this post."
appeared, because the query was silently retrying a lookup that could never succeed. Fixed both hooks
with a `retry` function that skips retrying a 404 specifically (still retries everything else, e.g. a
transient 5xx, up to the default 3 times). Verified live: both error states now appear in ~400-500ms
instead of ~7s. New tests: `surfaces isError on a 404 (post not found) without retrying` (asserts
`apiClient.get` called exactly once) and `still retries a non-404 failure` (asserts 4 calls: 1 + 3
retries) in `usePost.test.tsx`.

## Verification (Phase 5)

- `tsc -b --noEmit` / `eslint .`: clean.
- `pnpm test` (Vitest): 351/351 — new `usePost.test.tsx` (5 tests), 2 new tests in
  `HomeFeedPage.test.tsx` (cold direct-load, close-returns-to-sane-state), 1 new test each in
  `useHomeFeedData.test.tsx`/`useGroupsPageData.test.tsx` for `toggleLikeForPost`, 2 new tests in
  `CommentSection.test.tsx` for the loading/error states.
- `pnpm e2e`: 34/34, including new `post-deep-link.spec.ts` (2 tests: cold direct-URL load of a post
  outside the feed's first page — id 1020 of FEED-10's 21-post fixture, only reachable via "Load
  more"; and confirming the in-feed open/close path is now URL-addressable too).
- `pnpm test:visual`: same pre-existing Windows/Linux font-rendering noise documented since HF-12, not
  a regression — confirmed via direct diff-image inspection (uniform text-shift pattern, identical
  content/layout).
- Storybook: two new `CommentSection` stories (`PostLoading`, `PostNotFound`) screenshotted directly
  and visually confirmed correct.
- **Live-verified against the real running backend** (not just MSW): registered a test user, created a
  real post, confirmed `GET /api/posts/{postId}`'s response shape matches `Post`/`ApiResponse<Post>`
  field-for-field, and the 404 error shape matches `ApiResponse<null>` exactly as `usePost` assumes.
  Full browser walkthrough (login → direct navigation to `/posts/{realId}` → dialog renders correct
  content → close → back on `/`) — this is also where the retry-on-404 bug above was actually found.

## Acceptance criteria (from the backlog entry)

- ✅ Loading `/posts/{id}` as a fresh page load renders the correct post + comment thread, including
  for a post outside the feed's first loaded page — verified both in Vitest and e2e, plus live against
  the real backend.
- ✅ Opening via the existing in-feed click-to-open flow still works, no regression, no unnecessary
  duplicate fetch when the post is already in the feed's cache (`usePost`'s `initialData` seed,
  verified via a dedicated Vitest test asserting `apiClient.get` is never called in that case).
- ✅ Closing when opened via direct URL returns to a sane page state — verified in Vitest and e2e.
- ✅ `usePost`/MSW handler covered by Vitest, same pattern as `useComments`'s own test file.

## Deltas for later tickets

- **FEED-11** (visual regression for the comment modal) can now `page.goto('/posts/{id}')` directly
  instead of navigating to `/` and clicking through a real post card, per the sequencing note already
  on that ticket's backlog entry.
- **ANON-1** filed in `client/docs/BACKLOG_V1.md` — the "should this be publicly viewable without
  login" product decision, deliberately not answered here.
- Any future ticket adding a new like/unlike entry point that might act on a post outside the owning
  hook's own feed array should use the `toggleLikeForPost(post)` pattern, not `toggleLike(postId)`'s
  internal lookup, which silently no-ops in that case.
