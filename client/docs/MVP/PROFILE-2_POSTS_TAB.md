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

---

## Implementation summary (2026-08-26)

**Built as approved**, plus two corrections found at pickup and fixed in this same ticket (both user
decisions):

**Real cache-invalidation gap, found before writing any UI code.** `useLikePost`/`useUnlikePost`/
`useDeletePost`/`useCreatePost` (existing, shared) only reach query-cache buckets whose key starts
with `'feed'` and is tagged in `optimisticFeedUpdates.ts`'s `POST_FEED_TAGS` set. PROFILE-0's
`profileKeys.myPosts()` lived under a separate `'profile'` prefix — invisible to all three mutations'
optimistic updates and to their `onSettled` invalidation. As specced, liking/unliking/deleting a post
from this tab would have silently done nothing on screen (the mutation would still succeed
server-side) until some unrelated event forced a refetch. Fixed by repointing
`profileKeys.myPosts()` at `feedKeys.all` and adding `'my-posts'` to `POST_FEED_TAGS` — zero changes
needed inside the three mutation hooks themselves, they just started covering one more bucket.
Conceptually sound, not a hack: a user's own `USER_FEED` posts already appear in `personalFeed` too,
so "my posts" was never a separate Post-feed concept, just a different view over the same one.

**Real backend bug, found while checking what `/posts/mine` actually returns** (the first-ever
client consumer of this endpoint — confirmed by grepping the whole client tree, nothing else touches
it). `PostServiceImpl.getUserPosts()` queried `findByUserIdAndIsActiveTrue` with **no `postType`
filter at all**, so it could return `GROUP_SYSTEM`/`SESSION_POST` rows — internal anchors
`post-impl/CLAUDE.md` documents as "never meant to be reachable via `/api/posts/**`" — attributed to
whoever triggered them. Content itself is benign (e.g. `"Session: Sunday pickup"`), not a security
leak, but a real bug: violates the endpoint's own documented invariant, and the client's `PostType`
union (`USER_FEED | GROUP_POST | GROUP_BROADCAST`) doesn't even model the other two values. **Fixed
server-side** (user decision): new `PostRepository.findByUserIdAndPostTypeInAndIsActiveTrue`,
`getUserPosts` now passes `USER_VISIBLE_POST_TYPES = [USER_FEED]` — narrowed from an initial
`[USER_FEED, GROUP_POST, GROUP_BROADCAST]` (user correction, same day): `GROUP_POST`/
`GROUP_BROADCAST` belong to a specific group's own feed, not a personal "my posts" history, so this
tab only ever shows content the caller posted directly to their own feed. Every post `useMyPosts()`
returns is now guaranteed `groupId: null`, so `PostsTab`'s `Feed` never needed `groupsById`/
`showGroupName` wiring in the first place. Two Spock cases — one exercises the new query signature,
one asserts the passed type list never contains `GROUP_SYSTEM`/`SESSION_POST` so a future revert
back to the unfiltered method fails loudly.

**`hashtag` click-through wired in, not left inert** — `onHashtagClick` is a required prop on
`PostCard`/`Feed`/`CommentSection`, and every other post surface (Home Feed, Groups) wires it to
`HashtagPostsModal`. Leaving it a no-op here would have made hashtags work everywhere in the app
except silently on this one tab. Reused `HashtagPostsModal` + `useHashtagResultsData` exactly as
`HomeFeedPage.tsx` does — no new component.

**Built:**
- `features/profile/usePostsTabData.ts` — same shape as `useHomeFeedData`, scoped to `useMyPosts()`
  instead of the personalized feed. `createPost` tags with `profilePageStore`'s active sport pill,
  omitting `sportId` when the pill is `'all'`.
- `features/profile/components/PostsTab.tsx` — assembles `CreatePostForm` + `Feed` + `CommentSection`
  + `HashtagPostsModal`, all reused as-is. Comment-dialog open state is local `useState<number |
  null>`, **not** URL-routed like Home Feed's FEED-12 — no `/profile` route with a post-id param
  exists, and nothing requires this tab's dialog to be a deep link.

**No `PostsTab.stories.tsx`** — delta from the ticket's literal "Storybook: composer + list states"
line. Every visual state it asks for (composer empty/submitting/error, list empty/populated/loading/
error) already has a story on the reused `CreatePostForm`/`Feed` components themselves; `PostsTab`
introduces no new visual surface of its own. Matches the established precedent that page-shaped
composition components reading real hooks/stores (`HomeFeedPage`, `GroupsPage`) don't get their own
`.stories.tsx` file either.

**No dedicated `usePostsTabData.test.tsx`** — its logic (sport-tagging, like/delete wiring, pagination
exposure) is already exercised end-to-end through `PostsTab.test.tsx`'s 8 cases; a separate hook-level
test would just re-assert the same behavior through a narrower lens.

**Verification:** `PostsTab.test.tsx` (8 Vitest/RTL cases: renders composer + own posts, sport-pill
filtering, composer tags active sport, composer omits `sportId` for `'all'`, like/delete wiring,
comment dialog open + cache-seeded (no redundant `GET /posts/1` — confirms the cache-key fix works),
hashtag modal open). Full client suite green, `tsc -b` clean, `pnpm lint` clean (2 pre-existing
unrelated warnings). Backend: new/updated `PostServiceImplSpec` cases green,
`:modules:social:post-impl:test` and full `:server:test` both green. No browser walkthrough
(Claude-in-Chrome not connected this session, same gap noted on PROFILE-0/PROFILE-1).

---

**Delta (2026-08-27, at `PROFILE-4` pickup):** `/profile` has no `'all'` sport pill at all (user
decision, applying to the whole page, not just `PROFILE-4`'s own Settings tab — should have been
said back when this ticket was scoped). `usePostsTabData`/`PostsTab.tsx` retrofitted:
`activeSport` now comes from the new shared `useProfileActiveSport()` hook (defaults to the
caller's first sport profile instead of `'all'`), and the composer's `'all' → omit sportId` branch
is gone — a post is always tagged with a real `sportId` except the zero-sport-profile edge case
(no sport to tag with, `sportId` still omitted, just for a different reason). `PostsTab.tsx` passes
`activeSport ?? 'all'` to `Feed` for that same edge case only — `Feed` itself is untouched and still
shares its generic `SportKey | 'all'` contract with Home Feed/Groups, where `'all'` remains a real,
navigable state. `PostsTab.test.tsx` updated: the tests that implicitly relied on "both posts
visible by default" (the old `'all'`-default premise) now expect only the first sport's post; the
dedicated `'all'`-pill composer test was replaced with a zero-sport-profile equivalent. Full detail
in `PROFILE-4_SETTINGS_TAB_SPORT_PROFILE_EDITOR.md`'s implementation summary.
