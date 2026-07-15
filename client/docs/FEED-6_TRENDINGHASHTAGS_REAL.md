# FEED-6 · TrendingHashtags (real)

**Status:** `DONE` (2026-07-15) · **Type:** Integration · **Dependency:** FEED-0, HF-5 · **Spec:**
AUTH/FEED epic § FEED-6, substantially expanded via design discussion before implementation (see
below)

## Design (as approved)

The epic's spec is minimal: "pure data-source swap behind HF-5's component; hashtag click routes
to `usePostsByHashtag(tag)`." Both real hooks already existed from FEED-0
(`features/feed/hooks/useTrendingHashtags`, `usePostsByHashtag`), and backend bug A10 (the
hashtag-posts endpoint's unconditional 500) had already shipped fixed (2026-07-14) — so the
data-source swap itself was small. The click-through *destination* was unscoped (no
`design-reference-*.html` covers it, same situation FEED-2 hit for its comment modal), and was
resolved via a design conversation before implementation:

1. **Modal, not a route** — same "dialog over the current page" pattern FEED-2 already established
   for comments (`shared/ui/dialog.tsx`), not a new `/hashtag/:tag` page/route. No `useNavigate`,
   no `App.tsx` change.
2. **Fully interactive** — posts inside the modal render as real `PostCard`s (like/unlike, delete
   own post, open comments), reusing the existing `Feed` component directly rather than a
   stripped-down list.
3. **Clicking a post's comment icon while the hashtag modal is open closes the hashtag modal and
   opens `CommentSection` in its place** (not stacked dialogs) — simplest option, avoids
   nested-dialog focus/z-index edge cases with no design precedent to resolve them.

This is exactly what was built — no divergence between the approved design and the shipped code.

## What was built

**Data layer**
- `shared/hooks/useTrendingHashtags.ts` — swapped the mock array for a thin adapter over
  `features/feed/hooks/useTrendingHashtags` (the real `GET /api/hashtags/trending` hook, FEED-0),
  mapping `Hashtag { tag (no leading '#'), usageCount }` → `TrendingHashtag { tag (with '#'),
  postCount }` — same '#'-prefixing bridge FEED-1 already established for `Post.hashtags`. Same
  `{ data, isLoading, isError }` shape, so `TrendingHashtags` itself didn't change.
- `features/feed/hooks/usePostsByHashtag.ts` gained an `enabled` param (default `true`), same
  reasoning as `useComments(postId, enabled)` — the new `useHashtagResultsData` hook below is
  called unconditionally from the owning page (React's rules of hooks), so it must not fetch
  until a tag is actually selected.
- `features/feed/useHashtagResultsData.ts` (new) — mirrors `useCommentsData`'s role/shape, scoped
  to one tag: `usePostsByHashtag(tag, isOpen && tag !== null)` for posts, plus `useLikePost`/
  `useUnlikePost`/`useDeletePost` delegated straight through (no hashtag-specific cache-write
  logic needed — `optimisticFeedUpdates.ts`'s `POST_FEED_TAGS` already includes `'hashtag'`, so
  the existing optimistic mutations already target this query too).

**Component**
- `shared/components/HashtagPostsModal.tsx` (new) — presentational/controlled, no internal data
  hook (same convention `CommentSection` set). Header shows the tag + a close button; body reuses
  `Feed` directly (`activeSport="all"`, custom `emptyMessage`).
- `shared/components/Feed.tsx` gained one new optional prop, `emptyMessage?: string` (default:
  the existing "No posts yet for this sport."), so `HashtagPostsModal` can show a tag-specific
  empty message without forking `Feed`'s list-rendering logic.

**Page wiring** (`HomeFeedPage.tsx`, `GroupsPage.tsx`, identical pattern in both)
- New page-local `activeHashtag: string | null` state; `useHashtagResultsData(activeHashtag,
  activeHashtag !== null)`.
- `Feed`'s and `TrendingHashtags`' `onHashtagClick` props (both previously `noop`) now open the
  modal.
- `HashtagPostsModal` rendered alongside the page's other modals; its `onOpenComments` hides the
  hashtag modal before opening `CommentSection` (`setActiveCommentsPostId(postId)`), per the
  approved "close first" behavior.
- `activeCommentsPost`'s lookup now also falls back to `hashtagResultsData.data.posts` — a post
  surfaced only via the hashtag modal isn't necessarily in the main feed's already-loaded cache,
  which would otherwise render `CommentSection` with a null `post` (empty header; comments
  themselves still work, keyed by id). This doesn't solve the general "any post, any source" case
  (that's **FEED-12**'s job), just closes the one new gap this ticket introduced.

**Bug found and fixed (post-implementation, before merge):** the first version of the "close
hashtag modal, open comments" wiring cleared `activeHashtag` to `null` in the same handler as
setting `activeCommentsPostId` — since React batches both updates into one render,
`useHashtagResultsData(null, false)` immediately swapped to a *different*, empty query in that same
render, so the `activeCommentsPost` fallback above found nothing and `CommentSection` opened with a
null `post` (header/repeated content silently missing — only the comment list itself rendered,
since that part is keyed by id, not by the `post` object). Found via manual testing, not caught by
the original test (which only asserted a dialog existed, not its content). **Fixed** by splitting
"which tag's data to keep fetching" from "is the modal visually open" into two separate pieces of
state (`activeHashtag` vs. new `isHashtagModalOpen`) — `onOpenComments` now only clears
`isHashtagModalOpen`, leaving `activeHashtag` (and its query/cache) alive so the fallback lookup
still finds the post. `activeHashtag` is only cleared on a real dismissal (`onClose`: the X button,
Escape, or backdrop click). Strengthened `HomeFeedPage.test.tsx`'s existing transition test to
assert the post's header name and repeated content actually render inside `CommentSection` (not
just that *a* dialog exists), so this exact regression can't silently reappear.

## Follow-up UX changes (post-implementation, before merge, requested directly)

1. **Hashtags render inline within content, not as a duplicate row.** `PostCard` used to show
   `post.content` as plain text, then a *separate* row of hashtag pill buttons re-listing the same
   tags below it (from `post.hashtags`, the backend's structured extraction). Replaced with a new
   shared `shared/components/HashtagText.tsx` — parses any text for `#(\w+)` (the same pattern the
   backend's `HashtagServiceImpl` uses to populate `hashtags` in the first place, so what's
   clickable always matches what the backend actually indexed) and renders each match as an inline
   clickable button, leaving the rest as plain text. `PostCard` no longer reads `post.hashtags` at
   all. Applied everywhere post/comment content renders: `PostCard`, the comment modal's repeated
   post content, and `CommentItem`'s comment bodies (comments have no structured `hashtags` field,
   but the same text-pattern approach works identically and keeps the app consistent). Required
   adding `onHashtagClick` to `CommentSectionProps`/`CommentItemProps` (new, previously neither had
   any hashtag concept) — wired at the page level to close the comment dialog and open
   `HashtagPostsModal` for that tag (symmetric with the modal's own established "close first, don't
   stack" direction).
2. **The comment modal had no way to like the post itself.** The repeated post content was
   plain/non-interactive — found while verifying (1) above. Added a like button (heart icon +
   count, same controlled convention as `PostCard`'s) via a new `onTogglePostLike(postId)` prop.
   Wired at the page level to resolve which underlying mutation to call: the active post may have
   come from the main feed cache or the hashtag-results cache (see `activeCommentsPost`'s fallback
   above), and calling *both* `toggleLike`/`hashtagResultsData.toggleLike` unconditionally would
   double-fire the API when a post happens to be in both caches at once — so the handler checks
   `data.posts` first and only falls back to `hashtagResultsData.toggleLike` if the post isn't
   found there, guaranteeing exactly one mutation fires.

## Verified

- `tsc -b --force`: clean.
- `eslint .`: clean (one `react-hooks/immutability` violation caught and fixed along the way —
  `HashtagText`'s original implementation reset a module-level regex's `lastIndex` inside the
  component; switched to `String.prototype.matchAll`, which clones the regex internally per spec
  and never touches shared state).
- `pnpm test`: 65/65 files, 310/310 tests (up from 298 after the base ticket).
- `pnpm exec playwright test --project=e2e`: 29/29 passing, including a rewritten
  `home-feed-journey.spec.ts` step 5 (see below).
- Manual walkthrough against the real running backend (`./gradlew :server:bootRun` + `pnpm dev`):
  real trending rows render on both Home Feed and Groups; clicking a hashtag (from a post or the
  trending card) opens the modal with real matching posts; like/comment/delete all work inside it;
  clicking comment closes the hashtag modal and opens the comment dialog; a tag with zero posts
  shows the custom empty message.

## Test fallout fixed

Any existing test mocking `apiClient.get` for a fixed URL set (throwing on anything else) needed a
`/hashtags/trending` branch once the real hook mounts unconditionally on Home Feed/Groups:
`HomeFeedPage.test.tsx` (all three `apiClient.get` mock sites — the shared helper plus two inline
duplicates), `useHomeFeedData.test.tsx`, `useGroupsPageData.test.tsx`, and `App.test.tsx`'s Home
Feed assembled-page test (previously fell through to a *post*-shaped fallback for any unmatched
URL — now has an explicit empty-page branch).

## E2E spec updated

`e2e/flows/home-feed-journey.spec.ts` step 5 previously asserted hashtag clicks were inert no-ops
(per HF-11's own delta, pending this ticket). Rewritten to assert the real destination: clicking a
post's `#fridayrun` tag opens a dialog titled `#fridayrun` containing the 2 MSW fixture posts
tagged with it (`mockPost` + `mockGroupPost`); closing it returns to the feed with no URL change;
clicking the trending card's row reopens the same dialog; `Escape` closes it. Steps 1/2's
trending-button-count assertions dropped from 4 (the old mock array) to 1 (the real `mockHashtag`
fixture).

## Deltas for later tickets

- **Visual-regression baselines are now stale** (found via `pnpm exec playwright test
  --project=visual-regression`): all 9 committed Home Feed baselines diff, but confirmed via direct
  image inspection this is a single legitimate content change — the Trending card now renders 1 row
  (the real `mockHashtag` fixture) instead of the old mock array's 4, which shortens the page. No
  other content or layout drifted. Same reasoning as HF-13/14/15/16: the change is correct and
  shouldn't be reverted, but regenerating baselines (via the `client-ci` `update-baselines` manual
  dispatch, Linux-rendered per HF-12's precedent) is a separate concern from the feature that
  caused the drift. **Filed as HF-17** (`client/docs/BACKLOG_MVP.md`, `TODO`) rather than left as an
  open question.
- **No visual-regression coverage exists for `HashtagPostsModal` itself** — same "own future
  ticket" precedent FEED-11 already set for the comment modal (`design-reference-post-modal.html`
  exists retroactively for that one; no reference exists for this modal either). Not filed as its
  own ticket yet — flagged here so a future FEED-11-style ticket for this surface isn't a surprise.
- **`useHashtagResultsData`'s `activeCommentsPost` fallback (HomeFeedPage/GroupsPage) only checks
  two caches** (the main feed and the currently-open hashtag modal) — a post from neither source
  (e.g. a third feed view added later) would still hit the null-post gap. **FEED-12** (dedicated
  `usePost(postId)` fetch, already filed) is the real fix for the general case.
