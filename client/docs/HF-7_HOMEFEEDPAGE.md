# HF-7 · HomeFeedPage — layout, state wiring, data hook — implementation summary

**Ticket:** HF-7 (`client/docs/BACKLOG_MVP.md` #10, spec in `sporthub-home-feed-tickets.md` § HF-7)
**Date:** 2026-07-07
**Status:** DONE

## Approved design

The integration ticket: assemble HF-1..HF-6 into the real Home Feed screen behind a single data
boundary. Two deliberate divergences from the epic text, both pre-approved:

1. **No TopBar/NavTabs on the page** — the epic predates HF-1's `AppShell` layout route, which
   already wraps every page with the shell. The page renders SportSwitcher + the two-column grid
   only.
2. **Hook returns the CLAUDE.md convention shape**, not the epic's flat sketch:
   `{ data: { sportProfiles, posts, upcomingMatches, hashtags, broadcasts }, isLoading, isError,
   toggleLike }`. `client/CLAUDE.md` wins over the epic; this is the exact seam FEED-1/6/7 and
   SPORT-1 swap TanStack Query into without touching the page.

Other Phase 1 decisions: **stacking breakpoint = md (768px)** as the starting point (spec left it
open; HF-8 hardens), `activeSport` page-local `useState` (moves to Zustand when a second page
needs it), all navigation-ish actions are callback stubs (`noop`).

## What was built

```
src/features/home-feed/
  useHomeFeedData.ts (+ test)  mock-backed hook; posts in useState; toggleLike flips
                               likedByMe/likeCount immutably & synchronously (HF-3 contract);
                               isLoading/isError hardcoded false but part of the contract
  HomeFeedPage.tsx             replaced the HF-00 placeholder: SportSwitcher (mb-4) over
                               grid-cols-1 md:grid-cols-[1.6fr_1fr] gap-3.5; min-w-0 both
                               columns; rail = Upcoming → Trending → Broadcasts (gap-3.5)
  HomeFeedPage.test.tsx        4 tests (all sections render; sport filter hits feed+matches
                               while trending/broadcasts stay; like toggle round-trip through
                               the real hook; Add sport aria-disabled at the mock 3-cap)
src/App.test.tsx               updated: the "/" route test asserted the deleted placeholder
                               heading — now asserts the assembled page (premise change, stated)
```

## Key decisions & non-obvious details

- **`isLoading`/`isError` are consumed nowhere on the page yet** — always false with mock
  internals; skeleton/error/empty UI is explicitly FEED-8's scope. The flags exist now so the
  page signature doesn't change when they become real.
- **One `sportsByKey` map (useMemo)** feeds both Feed and UpcomingMatches — same object, same
  render pass, which is what makes the "no stale flash" acceptance criterion structural rather
  than incidental.
- Both hashtag surfaces (PostCard, TrendingHashtags) route to the same handler slot; tags carry
  `#` from both, so FEED-6's `usePostsByHashtag(tag)` wiring is one function later.
- Test gotcha: `#fridayrun` exists as both a post hashtag and a trending row — page-level tests
  must scope rail assertions with `within(getByRole('region', { name: ... }))`; the rail cards'
  `aria-label`s exist partly for this.

## Verification (all passing)

- `pnpm exec tsc -b` · `pnpm lint` · `pnpm test` (55/55 — 7 new)
- Real-browser walk on the Vite dev server (Playwright-driven, screenshots reviewed at 1280px and
  375px): full page matches the mockup; Basketball filter → 1 post + 1 match with rail cards
  unchanged; like 9→10→9; "All" restores; at 375px the rail stacks under the feed and pills wrap
  with no horizontal overflow.
- The Home Feed epic's screen is now fully assembled and browsable at `/`.
