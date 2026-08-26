# PROFILE-2 · Posts tab

**Status:** `TODO` · **Type:** Component · **Depends on:** `PROFILE-0` ·
**Filed:** 2026-08-26, from the `/profile` page `/feature` scoping session ·
**Design:** `client/docs/PROFILE_PAGE_DESIGN.md`

## What ships

The Posts tab content: the existing `CreatePostForm` (composer) + a list of the caller's own posts,
both fully real — `GET /api/posts/user/{userId}` already exists server-side (`PostService
.getUserPosts`), nothing new backend-side.

- **Composer** — reuse `CreatePostForm` + `useCreatePost` unchanged. New posts are tagged with the
  page's active `SportSwitcher` pill (`sportId`), not the composer's own inert "Tag sport" button —
  when the pill is `'all'`, `sportId` is omitted, same as today's Home Feed composer.
- **List** — `useUserPosts(userId)` (PROFILE-0) feeds a list of post cards (reuse whatever card
  component Home Feed's feed already renders, e.g. `PostCard`), each wired to the existing like
  mutation and to `CommentSection` via `usePost(postId)` + `useCommentsData(postId, isOpen)` — same
  wiring `HomeFeedPage` already does for FEED-12's deep link, not a new comment-modal
  implementation.
- **Sport-chip filtering** — client-side. `GET /api/posts/user/{userId}` has no `sportId` query
  param, so the fetched list is filtered in the component/hook by the active pill, same as the
  mockup's own `s.sport === 'all' || p.sport === s.sport` logic.

## Explicitly out of scope

Pagination UX beyond whatever `useUserPosts` already returns (`hasMore`/`fetchMore`) — no new
infinite-scroll mechanism if one doesn't already exist elsewhere to copy. Editing/deleting a post
from this tab is out of scope unless `PostCard` already supports it as the post owner (if it does,
it's inherited for free; if not, that's a separate ticket).

## Tests

Vitest/RTL — composer submits with the active sport tagged; list renders filtered by sport; like/
comment wiring reuses existing tested components so only the wiring itself needs coverage here.
Storybook: composer + list states (empty, populated, loading, error).
