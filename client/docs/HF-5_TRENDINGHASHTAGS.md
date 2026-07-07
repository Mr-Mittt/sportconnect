# HF-5 · TrendingHashtags — implementation summary

**Ticket:** HF-5 (`client/docs/BACKLOG_MVP.md` #8, spec in `sporthub-home-feed-tickets.md` § HF-5)
**Date:** 2026-07-07
**Status:** DONE

## Approved design

The "Trending" right-rail card: one full-width button per hashtag (whole row clickable, mockup
parity), tag left in accent, "`{postCount}` posts" right in muted, rows in **caller-provided
order** — the component never re-sorts. Presentational only, spec props
(`hashtags: TrendingHashtag[]`, `onHashtagClick(tag)`), no data fetching. Built against mock data;
**FEED-6 de-mocks it** against the already-real `GET /api/hashtags/trending` — nothing here should
change when that swap happens.

Decisions confirmed in Phase 1:

1. **Stays global** — epic open question #1 resolved: no `activeSport` filtering. Mockup shows all
   tags regardless of sport, the type has no sport field, and FEED-6's real endpoint owns any
   future filtering semantics.
2. **Empty state** (spec was silent): header stays, muted "Nothing trending right now." —
   consistent with Feed/UpcomingMatches.

## What was built

```
src/features/home-feed/components/
  TrendingHashtags.tsx          card with UpcomingMatches' chrome; row buttons with
                                justify-between, truncated tag + shrink-0 count; empty state
    TrendingHashtags.stories.tsx Default · Empty · LongTagTruncates
    TrendingHashtags.test.tsx   4 tests (rows render tag+count, caller order preserved,
                                click reports tag with # prefix, empty state)
```

No new types, tokens, data layer, page wiring (HF-7), or E2E/visual-regression changes
(HF-10b/HF-11 own those).

## Key decisions & non-obvious details

- **Truncation guard beyond the spec:** tag span is `truncate`, count is `shrink-0` — a long tag
  ellipsizes instead of pushing the count out of the card (verified by the LongTagTruncates
  story). Same "no layout overflow" bar HF-6 sets for broadcasts.
- Tags arrive **with the `#` prefix** (HF-0 delta) and are reported back unchanged —
  `onHashtagClick('#tournament')`, matching PostCard's hashtag callback so HF-7 can wire both to
  one handler.
- The order-preservation test feeds deliberately unsorted data and asserts DOM order — the
  acceptance criterion "component does not re-sort" is enforced, not assumed.

## Verification (all passing)

- `pnpm exec tsc -b` · `pnpm lint` · `pnpm test` (44/44 — 4 new)
- Storybook screenshots of all three stories checked against the mockup's Trending card: chrome,
  accent/muted pairing, row spacing, truncation, and empty state all correct.
