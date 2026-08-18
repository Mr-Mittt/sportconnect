# FEED-8 · Integration hardening

**Status:** `DONE` (2026-07-16) · **Type:** Hardening · **Dependency:** FEED-1..FEED-7, SPORT-1 · **Spec:**
AUTH/FEED epic § FEED-8

## Design (as approved)

The epic's spec is three lines: loading states must be a skeleton/spinner per component (not a blank
screen), error states need a retry affordance (a failed fetch must look different from a genuinely
empty feed), and empty states inherited from HF-3/HF-5/HF-6 must keep working unchanged. The backlog
title adds "pagination edges" on top of that, which the epic text doesn't spell out — resolved via
scoping discussion before implementation:

1. **Scope: all real-data surfaces on both pages.** `Feed`/`TrendingHashtags`/`GroupBroadcasts` on
   both `HomeFeedPage` and `GroupsPage`, plus `GroupSpaceSwitcher`'s own groups-list loading/error
   (Groups-page-only, no Home Feed equivalent). `UpcomingMatches` stays out (still mock-only, no
   `isLoading`/`isError` wired per HF-7's own delta). `SportSwitcher`/sport-profiles loading was
   **not** in the approved scope — flagged below as a follow-up gap, not fixed here. `CommentSection`
   already had minimal loading/error text from FEED-2 (no retry button) — left as-is to keep this
   ticket bounded.
2. **Retry mechanism: inline retry per failed component**, not a page-level banner — each card calls
   its own query's `refetch()`, so one section failing doesn't block the others.
3. **MSW error-simulation plumbing added now**, not deferred to FEED-10 — FEED-10's own acceptance
   criteria requires "at least one MSW-simulated error response," so this ticket adds the override
   modules FEED-10 will need rather than making it re-derive the same plumbing later.
4. **"Pagination edges" resolved as**: a failed "load more" (not the initial load) must leave
   already-loaded posts on screen and only swap the load-more control for its own retry affordance —
   found via TanStack Query v5's `isFetchNextPageError` flag, distinct from the initial-load `isError`.

This is exactly what was built — no divergence from the approved design.

## What was built

**New shared primitive**
- `src/shared/ui/skeleton.tsx` — shadcn-style `Skeleton` (`animate-pulse bg-surface-1 rounded-md`),
  no new design token needed (`surface-1` already existed).

**Data layer** (every hook keeps the same `{ data, isLoading, isError }`-shaped convention, just gains
fields — no existing consumer's shape changed):
- `shared/hooks/useTrendingHashtags.ts`, `shared/hooks/useGroupBroadcasts.ts` — gained `refetch`.
  `useGroupBroadcasts`' `refetch` runs both its underlying queries (`useActiveBroadcasts` +
  `useUserGroups`) via `Promise.all`, since either failing sets its `isError`.
- `features/home-feed/useHomeFeedData.ts`, `features/groups/useGroupsPageData.ts` — each gained
  `isLoadMorePostsError`/`retryPosts`, `isHashtagsLoading`/`isHashtagsError`/`retryHashtags`,
  `isBroadcastsLoading`/`isBroadcastsError`/`retryBroadcasts`; `useGroupsPageData` additionally gained
  `isGroupsLoading`/`isGroupsError`/`retryGroups` (the groups list, `GroupSpaceSwitcher`'s data source).
- `features/feed/useHashtagResultsData.ts` — gained `isLoadMorePostsError`/`retryPosts` too, since
  `HashtagPostsModal` reuses `Feed` directly and needs the same two fields to satisfy its props.

**Components** (each: `isLoading` → 2-3 row/card skeletons; `isError` → "Couldn't load X." + Retry
button; empty/loaded states unchanged from HF-3/5/6):
- `Feed.tsx` — 3 `PostCardSkeleton`s while loading; retry block on initial-load error. Separately,
  `isLoadMoreError` swaps just the "Load more" button for "Couldn't load more posts." + Retry
  (`onLoadMore` doubles as the retry action — same call, no new prop) while the already-loaded posts
  stay fully visible. Reused as-is by `HashtagPostsModal` (no changes needed there beyond threading
  the two new props through).
- `TrendingHashtags.tsx`, `GroupBroadcasts.tsx` — row skeletons + retry block, inside the existing
  card chrome (header stays visible in every state).
- `GroupSpaceSwitcher.tsx` (Groups page only) — pill skeletons while loading; retry block on error.
  This specifically prevents the pre-existing bug where a still-loading or failed groups fetch would
  render the same "0 groups, Join/Create" dashed-pill fallback a genuinely empty group list would —
  now loading/error are visually distinct from "you have no groups for this sport."

**Page wiring** — `HomeFeedPage.tsx`/`GroupsPage.tsx` thread the new hook fields into the corresponding
component props; `GroupsPage.tsx` additionally wires `GroupSpaceSwitcher`'s three new props.

**MSW error-simulation plumbing** (for FEED-10, mirroring the existing `emptyFeed.ts`/`expireSession.ts`
runtime-override pattern):
- `e2e/mocks/apiErrors.ts` — `overrideFeedToError`, `overrideTrendingToError`,
  `overrideBroadcastsToError`, `overrideGroupsToError`, each a 500 on the matching endpoint.
- `e2e/mocks/fixtures.ts` — `simulateFeedErrorOnNextLoad`, `simulateTrendingErrorOnNextLoad`,
  `simulateBroadcastsErrorOnNextLoad`, `simulateGroupsErrorOnNextLoad`, one per surface, following the
  same `addInitScript` + dynamic-import mechanism as `simulateExpiredSessionOnNextLoad`.

## Verified

- `tsc -b`: clean.
- `eslint .`: clean.
- `pnpm test`: 340/340 tests (up from 326 before this ticket) — 14 new: component-level
  loading/error/retry tests for `Feed` (incl. the load-more-error case), `TrendingHashtags`,
  `GroupBroadcasts`, `GroupSpaceSwitcher`, plus hook-level tests in `useHomeFeedData.test.tsx`,
  `useGroupsPageData.test.tsx`, and `useHashtagResultsData.test.tsx` asserting each new
  `isXError`/`retryX` pair actually flips on a failed→retried→succeeded fetch sequence (found and
  fixed a real test-authoring gotcha along the way: `act(() => query.refetch())` without `await`
  silently drops the state update from `waitFor`'s view — `await act(...)` is required whenever the
  wrapped call's own effect is what the assertion is waiting on).
- `pnpm exec playwright test --project=e2e`: 29/29 passing, no regressions from the loading-state
  behavior change (Feed/TrendingHashtags/GroupBroadcasts previously rendered `null` while loading;
  MSW's near-instant fixture responses mean no existing spec was timing-sensitive to that window).
- `pnpm exec playwright test --project=visual-regression`: same 9 "different" results as before this
  ticket, same diff ratios (0.01–0.04, one dimension mismatch on `empty-768`) — confirmed via direct
  comparison this is the pre-existing Windows/Linux font-rendering noise floor (HF-12's own note), not
  new drift; the loading/error states resolve before Playwright's screenshot, same as every prior
  ticket. **No HF-19 baseline-regen ticket needed.**
- Storybook: added `Loading`/`ErrorState` stories (and `LoadMoreError` for `Feed`) to all four changed
  components; screenshotted each via a throwaway Playwright script against the local Storybook
  server — all 9 new states render exactly as designed (skeletons match each card's real content
  shape, error states show the card's header, empty states are untouched).
- Live walkthrough against the real running backend (`./gradlew :server:bootRun` + `pnpm dev`):
  registered a fresh user, confirmed Home Feed and Groups pages both render their real
  Trending/Group-broadcasts/empty states correctly with no stuck loading and no error banners on the
  golden path — the new isLoading/isError wiring doesn't regress the normal case.

## Deltas for later tickets

- **`SportSwitcher`/sport-profiles loading has the same latent gap** `GroupSpaceSwitcher` had (a
  still-loading or failed sport-profiles fetch renders as "0 sports," indistinguishable from a real
  empty state) — **not fixed here**, since it wasn't named in the approved scope. Worth its own small
  follow-up if it's ever noticed in practice.
- **`CommentSection`'s error state has no retry button** (FEED-2 shipped `isError` as plain text only)
  — left alone to keep this ticket bounded to the epic's named surfaces; a natural small addition
  whenever `CommentSection` is next touched.
- FEED-10 (E2E functional test — feed/groups journey) can now use `e2e/mocks/apiErrors.ts` /
  `fixtures.ts`'s `simulate*ErrorOnNextLoad` helpers directly to satisfy its "at least one
  MSW-simulated error response" acceptance criterion, rather than adding this plumbing itself.

---

### FEED-8 · Integration hardening
**Status:** `DONE` (2026-07-16) · **Type:** Hardening · **Dependency:** FEED-1..FEED-7, SPORT-1 · **Spec:** AUTH/FEED epic § FEED-8 ·
**Summary:** `client/docs/FEED-8_INTEGRATION_HARDENING.md`

Skeletons while loading, retry affordance on error (failed fetch ≠ empty feed), empty states match
the mock versions'.

**Deltas for later tickets:**
- **Scope, as user-approved:** all real-data surfaces on both pages (`Feed`/`TrendingHashtags`/
  `GroupBroadcasts` on Home Feed + Groups, plus Groups-only `GroupSpaceSwitcher`). `UpcomingMatches`
  stays out (still mock-only). `SportSwitcher`/sport-profiles loading was **not** in scope — has the
  same latent "loading looks like empty" gap `GroupSpaceSwitcher` had, left unfixed, flagged for a
  future ticket if it's ever noticed. `CommentSection`'s error state still has no retry button
  (FEED-2's plain-text version) — also left as-is.
- **"Pagination edge" resolved as**: a failed "load more" (via TanStack Query v5's
  `isFetchNextPageError`, distinct from the initial-load `isError`) keeps already-loaded posts
  visible and only swaps the load-more control for its own retry affordance.
- **MSW error-simulation plumbing added now, not deferred**: `e2e/mocks/apiErrors.ts` +
  `fixtures.ts`'s `simulateFeedErrorOnNextLoad`/`simulateTrendingErrorOnNextLoad`/
  `simulateBroadcastsErrorOnNextLoad`/`simulateGroupsErrorOnNextLoad` — **FEED-10 should reuse these**
  for its "at least one MSW-simulated error response" acceptance criterion rather than re-deriving the
  same runtime-override plumbing.
- New shared `src/shared/ui/skeleton.tsx` primitive — reuse for any future loading-state UI rather
  than hand-rolling `animate-pulse` divs per component.
