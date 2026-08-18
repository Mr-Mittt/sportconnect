# HF-4 · UpcomingMatches — implementation summary

**Ticket:** HF-4 (`client/docs/BACKLOG_MVP.md` #7, spec in `sporthub-home-feed-tickets.md` § HF-4)
**Date:** 2026-07-06
**Status:** DONE

## Approved design

Right-rail card listing the user's upcoming matches, filtered by the same `activeSport` as the
Feed. Presentational and controlled: spec props (`matches`, `activeSport`, `sportsByKey`,
`onSeeAll`, `onSelectMatch`), no data fetching — HF-7's hook feeds it `mockUpcomingMatches`, and
it **stays mock-backed for the whole MVP** (no matches backend module exists — see the backlog's
reality check). CTA per spec: `"{spotsLeft} spots left, join"` when open, `"Full, view details"`
when full — distinguishable by text, not color alone. Both variants only call
`onSelectMatch(match.id)`; no join logic or destination screen in this epic.

Decisions confirmed in Phase 1:

1. **Visible-item cap = 4** (the spec's open question, resolved by the user): filter first, then
   render at most 4, the rest live behind "See all". Implemented as an optional `maxVisible` prop
   (default 4) — a deliberate addition to the spec's prop list so the future Matches page can reuse
   the component with a different cap.
2. Everything else as specced.

## What was built

```
src/shared/lib/
  startTime.ts (+ test)        formatStartTime(iso, now?) — future counterpart of
                               formatRelativeTime: "Today, 7:00 PM" / "Tomorrow, 7:00 PM" /
                               "Wed, 6:30 PM" (< 7 days) / "Jul 14, 6:30 PM" (beyond).
                               Calendar-day based (differenceInCalendarDays), injectable `now`.
src/features/home-feed/components/
  UpcomingMatches.tsx          mockup-faithful card: "Upcoming" header + accent "See all",
                               hairline inner cards with 22px ramp icon circle (getSportIcon +
                               getRampBadgeClasses), clock/map-pin meta rows, full-width hairline
                               CTA (text-muted when full); empty state keeps the header visible
    UpcomingMatches.stories.tsx AllSports · FilteredBasketball · FilteredTennisFull ·
                               EmptyForSport · CappedAtFour
    UpcomingMatches.test.tsx   8 tests (all/filtered/empty, distinct CTA texts, onSelectMatch id
                               from both CTA variants, onSeeAll, default + custom cap)
```

No new types (reuses `UpcomingMatch` from HF-0), no data layer, no page wiring (HF-7), no
E2E/visual-regression changes (HF-10b/HF-11 own those).

## Key decisions & non-obvious details

- **`formatStartTime` lives in `src/shared/lib/`**, not the feature folder — the future Matches
  page needs the identical format; same reasoning that put `formatRelativeTime` there in HF-3.
  Its tests use **local-time** fixtures deliberately: output renders in the viewer's timezone, so
  UTC fixtures would be machine-dependent.
- **CTA `aria-label` includes the match title** (`"{title} — {ctaText}"`) — a11y delta over the
  spec: sibling cards would otherwise expose several identical "2 spots left, join" button names
  to a screen reader.
- **Tailwind v4 fractional spacing** (`size-5.5` = 22px icon circle, `py-1.25` = 5px CTA padding)
  instead of arbitrary `[22px]`-style values — keeps HF-10b's token/px audit clean; `py-1.75` in
  SportSwitcher set the precedent.
- Followed the HF-3 gotchas: ramp classes via the static `getRampBadgeClasses` map (never
  interpolated), icon lookup via `createElement` (react-hooks `static-components` rule), no
  `border-hairline` + directional-border stacking.
- No pluralization of "1 spots left" — the spec's literal CTA template kept for mockup parity.

## Verification (all passing)

- `pnpm exec tsc -b` · `pnpm lint` · `pnpm test` (40/40 — 13 new)
- Storybook screenshots of all five stories compared against the mockup's right rail: card chrome,
  ramp circles (teal/coral/purple), meta rows, muted full-CTA, surviving header in the empty
  state, cap rendering 4 of 6 all correct.
- One test bug caught during verification (shared fixture location made `getByText` ambiguous) —
  fixed in the test, not the component.

---

### HF-4 · UpcomingMatches
**Status:** `DONE` (2026-07-06) · **Type:** Component · **Dependency:** HF-0 · **Spec:** HF epic § HF-4 ·
**Summary:** `client/docs/HF-4_UPCOMINGMATCHES.md`

Right-rail block, filters by `activeSport`, "spots left, join" vs "Full, view details" CTAs
(distinguishable without color). **Stays mock for the whole MVP** — no matches backend exists.

**Deltas for later tickets:**
- **Cap resolved (user decision):** at most 4 matches render after filtering; the rest are behind
  "See all". Exposed as `maxVisible?: number` (default 4) beyond the spec's prop list.
- `formatStartTime()` in `@/shared/lib/startTime.ts` formats *future* timestamps ("Today/Tomorrow,
  7:00 PM" → weekday < 7 days → date). The future Matches screen must reuse it, not re-format;
  `formatRelativeTime` remains past-only.
- CTA buttons carry `aria-label` = `"{title} — {ctaText}"` — keep this pattern when the Matches
  page renders similar cards.
