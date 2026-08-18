# FEED-1 · Feed + PostCard (real)

**Status:** `DONE` (2026-07-14) · **Type:** Integration · **Dependency:** FEED-0, HF-3 · **Spec:** AUTH/FEED epic § FEED-1

De-mocks HF-3's `Feed`/`PostCard` against `GET /api/posts/feed`, with real optimistic
like/unlike/delete. Absorbs post-impl's old F1 ticket.

## Scope note

This was larger than a typical data-source swap: HF-3 shipped with **zero pagination
affordance** (a flat mock array) and a `Post` shape entirely different from the real DTO
(`id: string` → `number`, `sport: SportKey` → `sportId: number`, `authorName` → `userFullName`,
`text` → `content`, `likedByMe` → `isLikedByCurrentUser`, hashtags with `#` → without). Every
piece below was a real decision, not a mechanical rename.

## Design (as approved) vs. what shipped

The approved Phase 3 design is what shipped, with one correction discovered during
implementation (noted below) and one scope note on delete e2e coverage (added, not originally
scoped).

### 1. Types
- `src/features/home-feed/types.ts` — removed the mock `Post` interface.
- New `src/features/feed/sportIdMap.ts` — temporary `SPORT_ID_BY_KEY: Record<SportKey, number>`
  bridging `SportKey` to the backend's real `sports.id`, derived from
  `V003__create_sports_tables.sql`'s insertion order and **confirmed live against the running
  backend** (`GET /api/sports`: Badminton=1, Tennis=2, Soccer=5, Basketball=6). The backend has
  no sport named "Football" — only "Soccer" — the map treats them as the same sport; SPORT-1's
  real mapping inherits this same naming decision.

### 2. Data layer
- `useLikePost`/`useUnlikePost`/`useDeletePost` (`src/features/feed/hooks/`) gained real
  optimistic updates via a new shared `src/features/feed/optimisticFeedUpdates.ts`
  (`updatePostInFeedCaches`/`removePostFromFeedCaches`/snapshot+restore) — `onMutate` flips the
  cache immediately across every mounted feed-shaped query, `onError` rolls back, `onSettled`
  invalidates in the background for eventual consistency against the server's Redis-backed
  counters.
- New `src/shared/lib/useInfiniteScrollSentinel.ts` — `IntersectionObserver`-based hook powering
  scroll-triggered `fetchNextPage()`, paired with an always-rendered "Load more" button as the
  keyboard/screen-reader-reachable fallback (per the design's own a11y requirement for choosing
  true infinite scroll over a button-only pattern).
- `useHomeFeedData.ts` — swapped mock `useState`/`mockPosts` internals for `usePersonalFeed()` +
  the three mutations + `useAuthStore` (for `currentUserId`). Return shape grew:
  `fetchMorePosts`/`hasMorePosts`/`isFetchingMorePosts`/`deletePost`/`currentUserId` alongside the
  existing `data`/`isLoading`/`isError`/`toggleLike`. `toggleLike(postId)` resolves like-vs-unlike
  itself from the post's current `isLikedByCurrentUser`, since the real API has two separate
  endpoints but PostCard's controlled-like contract only reports "clicked," not direction.

### 3. Components
- `PostCard.tsx` — full prop rewrite against the real `Post`. Initials now derived from
  `userFullName` (no separate field on the wire); `userFullName: null` falls back to "Unknown
  User" (same convention `CommentServiceImpl` already uses server-side). Sport badge is
  `SportProfile | null` — a post whose `sportId` doesn't resolve via the temp map renders with no
  badge instead of crashing. Hashtags render/emit with a `#` prefix, bridging the confirmed
  no-`#` backend convention to the existing HF-5/HF-6 callback convention. New "..." dropdown
  menu (reusing `dropdown-menu.tsx`, the same primitive `TopBar`'s avatar menu already uses) with
  "Delete post," shown only when `post.userId === currentUserId`.
- `Feed.tsx` — real `Post[]`, sport filter resolves via the temp map, renders the sentinel +
  "Load more" button. `isLoading`/`isError` render nothing (matches HF-7's own precedent —
  FEED-8 owns the actual loading/error UI) rather than showing the misleading "no posts" empty
  message during load.

### 4. Page/state wiring
`HomeFeedPage.tsx` threads `deletePost`/`currentUserId`/pagination fields through to `Feed`.
`activeSport` stays page-local (unchanged from HF-7).

### 5. MSW handlers — corrected from the original plan

**Deviation from the approved design:** the plan said to build a new MSW fixture "mirroring the
existing 4 mock posts 1:1." Implementation found FEED-0 had already built `e2e/mocks/handlers/
feed.ts` with its own 2-post fixture (`mockPost` + `mockGroupPost`, both owned by the seeded test
user "Jordan Lee") — a different, pre-existing foundation, not the old `mockData.ts` set. Rather
than build a second, competing fixture, this ticket **extended FEED-0's existing fixtures**
instead:
- Fixed a real latent bug: `mockPost.sportId` was `1` (Badminton) with `sportName: 'Football'` —
  inconsistent with the real backend (no "Football" sport exists; id 1 is Badminton, id 5 is
  Soccer). Corrected to `sportId: 5, sportName: 'Soccer'`, confirmed against the live backend.
- Added `mockBasketballPost` (a friend's post, not the test user's — covers the "no delete menu
  on someone else's post" case and gives the feed a second sport to filter).
- Made the feed-related handlers **stateful** (`postsState`, mutated by like/unlike/delete/create)
  instead of static responders. This was necessary, not optional: FEED-1's mutations always
  reconcile via a background `invalidateQueries` that refetches `GET /posts/feed` — a stateless
  handler would return the original unliked/undeleted fixture on that refetch and silently clobber
  the optimistic UI a moment later. Caught first in `useHomeFeedData`'s own Vitest suite (same root
  cause, fixed there with a per-test stateful mock) before fixing the MSW handler the same way.
- New `e2e/mocks/emptyFeed.ts` + `fixtures.ts`'s `seedEmptyFeedOnNextLoad` — replaces the removed
  `?visual-state=empty` posts-emptying seam (that query param now only empties `upcomingMatches`,
  which stays mock for this whole MVP) with a real MSW override, per HF-10b's own delta.

### 6. Existing e2e/visual specs

Rewired `home-feed-journey.spec.ts` (steps 1/4 now hit the real feed/like handlers, per HF-11's
own MSW upgrade map), `a11y.spec.ts` (sport-filtered post count/comment updated; also now waits
for the feed to actually finish loading before running overflow/axe checks, since the feed is
async now), and `app-home-feed.spec.ts` (empty state uses the MSW override). Added a new step 8 to
the journey spec covering delete (not in the original HF-11 spec, which predates PostCard having
any ownership concept) — the fixture's user-owned posts made this essentially free to cover
end-to-end alongside the dedicated `PostCard.test.tsx`/`useDeletePost.test.tsx` coverage.

## Verification

- `pnpm exec tsc -b`, `pnpm vitest run` — 164/164 unit/component tests, clean typecheck.
- `pnpm exec storybook build` — clean, including the rewritten `PostCard`/`Feed` stories.
- `pnpm exec playwright test --project=e2e` — 29/29, including the rewritten specs.
- **Live-verified against the actually running backend** (not just MSW): registered a real user,
  created a post, confirmed `userFullName`/`sportName`/`shareCount` populate (A9), hit
  `GET /posts/hashtag/{tag}` without a 500 (A10), liked/unliked/deleted, and confirmed the like
  persists across the optimistic mutation's background refetch. Also drove the real Vite dev
  server + real backend through an actual browser (Playwright, no MSW) — screenshots confirmed
  real posts, correct sport badges via the sportId map, and correct sport-filtering.
- `pnpm exec playwright test --project=visual-regression` — **9 of 9 Home Feed baseline
  captures diff against the committed screenshots**, exactly as anticipated in the design (real
  content differs from the old mock content, and the new delete menu appears on the 2 of 3 fixture
  posts owned by the test user). Confirmed via direct image inspection that the diffs are the
  expected change, not a regression. Per the HF-13/HF-14 precedent (baselines must be
  Linux-rendered via CI's `update-baselines` dispatch, not regenerated locally on Windows), this
  is **not fixed in this ticket** — filed as follow-up **HF-15** (`client/docs/BACKLOG_MVP.md`).

## Out of scope (unchanged from the ticket)

Comment section (FEED-2), post composer (FEED-3), group switching (FEED-4/5), real trending
hashtags/broadcasts (FEED-6/7), real sport switcher (SPORT-1), loading/error skeleton UI
(FEED-8) — all separate tickets, all still queued.

---

### FEED-1 · Feed + PostCard (real)
**Status:** `DONE` (2026-07-14) · **Summary:** `client/docs/FEED-1_FEED_POSTCARD_REAL.md`
**Type:** Integration · **Dependency:** FEED-0, HF-3 · **Spec:** AUTH/FEED epic § FEED-1

De-mocks HF-3 against `GET /api/posts/feed`; optimistic like with rollback; delete own posts.
Absorbs post-impl's old F1 ticket ("Frontend — personalized feed").

**Deltas for later tickets:**
- **Temporary `sportId` bridge added:** `src/features/feed/sportIdMap.ts` maps `SportKey` →
  real backend `sportId` (football→5/Soccer, basketball→6, tennis→2), confirmed live against
  `GET /api/sports`. SPORT-1 replaces this file with the real backend-driven mapping — reuse the
  same football↔Soccer naming decision, don't re-litigate it.
- **`e2e/mocks/handlers/feed.ts` is now a small stateful fake backend**, not a fixed responder —
  `postsState` is mutated by the like/unlike/delete/create handlers. Any future ticket adding a
  feed-shaped MSW handler with a mutation should follow this pattern, not a static response, or
  its own optimistic-mutation-then-invalidate cycle will self-clobber the same way this ticket's
  first attempt did.
- **`e2e/mocks/fixtures.ts`'s `mockPost.sportId` was `1` (Badminton) — corrected to `5` (Soccer)**,
  a real bug (there's no "Football" sport in the real backend at all). Any ticket relying on
  `mockPost`'s sport should use the corrected value.
- **HF-15 filed** (visual-regression baselines stale — real content + new delete menu). Any
  ticket touching `PostCard`/`Feed` again before HF-15 lands should expect the same staleness and
  roll it into the same regen, per the HF-13/HF-14 precedent.
- **FEED-8's loading/error UI** now has real `isLoading`/`isError` wired all the way through
  (`useHomeFeedData` → `Feed`) — `Feed` currently renders `null` for both (matching HF-7's own
  precedent), FEED-8 replaces that with the real skeleton/retry UI.
