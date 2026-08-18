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

---

### FEED-12 · Comment modal fetches its own post + URL-addressable deep link — new ticket, not in either epic
**Status:** `DONE` (2026-07-17) · **Summary:** `client/docs/FEED-12_COMMENT_MODAL_DEEP_LINK.md` ·
**Type:** Feature · **Dependency:** FEED-2 (`DONE`) ·
**Origin:** raised by the user right after FEED-2 merged (PR #32) — today `CommentSection`'s `post`/
`sport` props are resolved by `HomeFeedPage` purely by looking up `data.posts.find(post => post.id
=== activeCommentsPostId)` against `usePersonalFeed()`'s already-loaded cache
(`HomeFeedPage.tsx`). Two real consequences of that:

1. **The modal can only ever open for a post the feed has already fetched.** A post outside the
   currently loaded pages (e.g., paginated further than the user has scrolled, or from a different
   feed view entirely) has no path to a comment dialog today.
2. **There is no URL that opens directly to a post's comment thread.** No route reads a `postId`
   from the URL at all — the dialog is 100% driven by in-memory page state
   (`activeCommentsPostId`), so a shared link, a notification deep link, or a page refresh while the
   dialog is open all have nowhere to go.

**What changes:**
1. A new `usePost(postId)` hook (TanStack Query) wrapping `GET /api/posts/{postId}` (confirmed to
   exist — `PostController.getPost()`, returns the same `PostResponse` shape `usePersonalFeed`
   already types against, no new client type needed). Query key should be independent of the feed
   (e.g. `feedKeys.post(postId)`) but consider seeding it via `initialData` from the feed cache when
   the post is already known there, so opening the dialog from within an already-loaded feed doesn't
   trigger a redundant network round-trip — only the "not in cache" / direct-URL path should
   actually hit the network.
2. `CommentSection`'s `post`/`sport` props come from this dedicated fetch instead of
   `HomeFeedPage`'s feed-cache lookup — this decouples the modal entirely from feed pagination
   state, and is what actually makes it work from a cold direct-URL load.
3. A URL route — recommend path-based (`/posts/:postId`), matching this app's existing route style
   (`App.tsx`'s flat `<Route path="/...">` list) over a query param, since a query-param convention
   was already deliberately retired once (`?visual-state=empty`, removed per HF-10b's own delta once
   a real seam existed). **Exactly what renders at that route is a real design decision, not
   assumed here** — same kind of question FEED-2's modal-vs-inline was, worth confirming with the
   user at pickup rather than guessing: does `/posts/:id` render the full `HomeFeedPage` underneath
   with the dialog pre-opened (simplest, reuses everything), or a lighter dedicated single-post
   shell? The former is almost certainly right unless there's a reason to avoid loading/rendering
   the whole feed just to view one post's comments.
4. Close behavior when opened via direct URL needs to be sane — e.g. navigate back to `/` on close
   rather than leaving a bare page behind the dialog. Decide whether browser back/forward should
   also close it (likely yes, for free, if using a real route rather than a state flag).
5. New MSW handler: `GET /api/posts/:postId` doesn't exist in `e2e/mocks/handlers/feed.ts` yet
   (only list/feed endpoints and `DELETE /api/posts/:postId` exist today) — add it, reusing
   `postsState`.

**Filed (2026-07-17):** whether an anonymous (logged-out) visitor should be able to view a shared
`/posts/:postId` link **without** logging in at all is a real product question this ticket doesn't
answer — MVP behavior is the same `ProtectedRoute` redirect-then-bounce-back every other deep link
already gets (AUTH-8 step 7), which is correct and sufficient for this ticket. Filed as **ANON-1** in
the new `client/docs/BACKLOG_V1.md` for a future decision + scoping pass, not built here.

**Sequencing note:** this simplifies **FEED-11** (below) — once the modal is reachable by URL,
FEED-11's visual-regression spec can `page.goto('/posts/123')` directly instead of navigating to `/`
and clicking through a real post card to open the dialog. Recommended to pick this up before FEED-11,
though not a hard blocker if FEED-11 lands first (its spec would just need a follow-up simplification
pass afterward).

**Acceptance criteria:**
- Loading `/posts/{id}` as a fresh page load (no prior feed fetch, e.g. a new tab) renders the
  correct post + comment thread, including for a post that would not be present in the feed's first
  loaded page.
- Opening the dialog via the existing in-feed click-to-open flow still works, with no regression and
  no unnecessary duplicate fetch when the post is already in the feed's cache.
- Closing the dialog when it was opened via direct URL returns to a sane page state (not a bare
  backdrop with nothing behind it).
- `usePost`/MSW handler covered by Vitest, same pattern as `useComments`'s own test file.

**Delta (2026-07-17, executed):** the plan's "does `/posts/:id` render the full HomeFeedPage underneath
with the dialog pre-opened, or a lighter dedicated single-post shell?" open question resolved to the
former (Option A), with a caveat confirmed at pickup: on a cold direct-URL load, the page behind the
dialog is the viewer's own generic Home Feed, not anything contextual to the shared post — accepted
since the modal has focus regardless. **New scoping decision, not in the original ticket text:**
Groups page (which also opens `CommentSection`) stays local-state-only, no `/posts/:postId` routing —
only Home Feed's comment dialog is URL-addressable, since routing Groups' opens through that URL would
unmount Groups' own selected-group state on close. **Filed ANON-1** in a new `client/docs/BACKLOG_V1.md`
for the "should a shared link be viewable while logged out" question — MVP behavior is the existing
generic `ProtectedRoute` redirect-then-bounce-back, not a new mechanism. Live-backend verification
found and fixed a real bug outside the original plan: neither `usePost` nor the pre-existing
`useComments` skipped TanStack Query's default retry on a 404, so a bad link took ~7s to show its error
state — both fixed. Full write-up: `client/docs/FEED-12_COMMENT_MODAL_DEEP_LINK.md`.
