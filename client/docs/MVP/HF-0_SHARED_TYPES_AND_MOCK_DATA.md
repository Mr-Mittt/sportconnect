# HF-0 · Shared types and mock data layer — implementation summary

**Ticket:** HF-0 (`client/docs/BACKLOG_MVP.md` #2, spec in `sporthub-home-feed-tickets.md` § HF-0)
**Date:** 2026-07-06
**Status:** DONE

## Approved design

Ship the stable contract HF-1..HF-6 build against in parallel: the six TypeScript models verbatim
from the epic spec, plus mock data ported from the approved mockup's embedded arrays
(`docs/design-reference-home-feed.html`, `<script>` block). Three mapping decisions approved in
Phase 3:

1. **Dynamic timestamps** — the mockup hardcodes relative labels (`'2h'`, `'Tomorrow, 7:00 PM'`);
   the types require ISO strings and HF-3 requires relative time to be *computed*. `mockData.ts`
   derives timestamps from load time (`hoursAgo(2)`, `hoursFromNow(24)`) so the mockup's intent
   renders correctly on any day.
2. **No synthetic `'All'` entry** — the mockup's `sports` array includes one; HF-2's spec says the
   SportSwitcher component adds "All" itself, so only the 3 real sports are ported.
3. **Icon names, not CSS classes** — mockup uses `ti-ball-football`; the `SportProfile.icon`
   contract is the bare icon name (`ball-football`), per the spec's own example.

## What was built

```
src/features/home-feed/
  types.ts           SportKey, SportProfile, Post, UpcomingMatch, TrendingHashtag, GroupBroadcast
                     (verbatim from the epic spec, strict-mode clean)
  mockData.ts        mockSportProfiles (3) · mockPosts (4, all 3 sports covered) ·
                     mockUpcomingMatches (3, incl. one full at spotsLeft=0) ·
                     mockTrendingHashtags (4) · mockGroupBroadcasts (2)
  mockData.test.ts   HF-0's acceptance criteria encoded as 5 Vitest assertions, so later edits
                     to mock data can't silently regress the guaranteed coverage
```

Hashtags keep the `#` prefix (`'#fridayrun'`) exactly as the mockup renders them, consistently in
both `Post.hashtags` and `TrendingHashtag.tag`.

## Scope boundaries honored

- No `useHomeFeedData()` hook — that's HF-7's deliverable; this ticket only ships the module.
- No component imports these arrays (none exist yet to do so); the no-direct-import rule is
  enforced by convention (`client/CLAUDE.md`) and restated in `mockData.ts`'s header comment.
- These are the *mockup's* shapes, deliberately not backend DTOs: sport profiles, hashtags, and
  broadcasts are re-typed against real DTOs by SPORT-1/FEED-6/FEED-7; matches stay mock until a
  matches backend exists.

## Verification (all passing)

- `pnpm lint` — clean
- `pnpm test` — 7/7 (2 existing App smoke tests + 5 new mockData coverage tests)
- `pnpm build` — `tsc -b` (strict) + Vite build OK

No divergence from the approved design.

---

### HF-0 · Shared types and mock data layer
**Status:** `DONE` (2026-07-06) · **Type:** Foundation · **Dependency:** HF-00 · **Spec:** HF epic § HF-0 ·
**Summary:** `client/docs/HF-0_SHARED_TYPES_AND_MOCK_DATA.md`

`src/features/home-feed/types.ts` (`SportKey`, `SportProfile`, `Post`, `UpcomingMatch`,
`TrendingHashtag`, `GroupBroadcast`) + `mockData.ts`. Per the epic's scope update, mock data is a
temporary stand-in for everything except matches — and with SPORT-1 now real (see Reality check),
matches are the only piece whose mock survives this MVP.

**Deltas for later tickets:**
- Mock timestamps are computed from load time (`hoursAgo()`/`hoursFromNow()` in `mockData.ts`),
  not hardcoded — don't assert exact timestamp values in tests, assert relative behavior.
- `mockSportProfiles` has no synthetic `'All'` entry (HF-2's component adds it) and `icon` values
  are bare names (`ball-football`), not `ti-` CSS classes.
- Hashtags include the `#` prefix in both `Post.hashtags` and `TrendingHashtag.tag`.
- `mockData.test.ts` encodes HF-0's coverage acceptance criteria — extend it if you extend the data.
