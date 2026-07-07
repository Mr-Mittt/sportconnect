# HF-3 · PostCard + Feed — implementation summary

**Ticket:** HF-3 (`client/docs/BACKLOG_MVP.md` #6, spec in `sporthub-home-feed-tickets.md` § HF-3)
**Date:** 2026-07-06
**Status:** DONE

## Approved design

Feed (sport-filtered post list + empty state) and PostCard (author/avatar, relative time, ramp
sport badge, body, clickable hashtags, like toggle, display-only comment count), with two decisions
confirmed in Phase 1:

1. **date-fns** for relative time, wrapped in a shared short-format helper matching the mockup
   ("just now" / "5m ago" / "2h ago" / "3d ago").
2. **Controlled like state** — `client/CLAUDE.md`'s controlled-component rule wins over the epic's
   literal "PostCard optimistically increments its own count": PostCard renders `likedByMe`/
   `likeCount` from props and reports clicks via `onToggleLike(post.id)`. HF-7's mock hook flips
   state synchronously (zero perceptible delay), and FEED-1's TanStack optimistic mutation later
   slots in with no PostCard change.

## What was built

```
src/shared/lib/
  relativeTime.ts (+ test)     formatRelativeTime(iso, now?) — date-fns math, short unit labels
  rampStyles.ts                getRampBadgeClasses(ramp) — STATIC class map (see gotcha below),
                               neutral fallback for unknown ramps
src/features/home-feed/components/
  PostCard.tsx                 mockup-faithful card; shared Avatar (36px, initials fallback),
                               ramp badge via getSportIcon + getRampBadgeClasses, aria-pressed
                               like toggle (IconHeart/IconHeartFilled, text-danger when liked)
    PostCard.stories.tsx       Unliked · Liked · WithAvatarImage · LongTextManyTags
    PostCard.test.tsx          4 tests (render incl. computed "2h ago", like contract +
                               controlled rerender, hashtag click, comment count not a button)
  Feed.tsx                     filters by activeSport ('all' = none); empty state
    Feed.stories.tsx           AllSports · FilteredBasketball · EmptyForSport
    Feed.test.tsx              3 tests (all / filtered / empty)
src/index.css                  NEW: border-hairline-t / border-hairline-b utilities
```

## Bugs found & fixed during verification (both visual, caught by story screenshots)

1. **Hairline + directional border stacking:** `border-hairline` sets all four sides at 0.5px, so
   combining it with `border-t`/`border-b` (1px) produced a full box instead of a single edge —
   visible in the PostCard footer AND retroactively in HF-1's NavTabs (its bottom border was
   actually a full box, diverging from the mockup). Fixed by adding `border-hairline-t`/
   `border-hairline-b` utilities and switching both components to them. **Rule going forward:
   never combine `border-hairline` with `border-t/b/l/r`.**
2. **Dynamic ramp classes can't be interpolated:** `bg-${ramp}-50` produces no CSS (Tailwind's
   static scanner). `rampStyles.ts` exists precisely to keep these as complete static strings —
   HF-4/HF-6 must use it rather than interpolating. (An apparent "coral classes missing" scare
   during verification turned out to be stale HMR CSS; final computed styles confirmed
   coral/teal both correct.)
3. **Lint:** react-hooks v7's `static-components` rule flags `const BadgeIcon = getSportIcon(...)`
   inside render; rendered via `createElement(getSportIcon(...), props)` instead.

## Verification (all passing)

- `pnpm lint` · `pnpm test` (27/27 — 10 new) · `pnpm build` · `pnpm e2e` · `pnpm build-storybook`
- Storybook screenshots compared against the mockup's feed column: card chrome, 36px initials
  avatar, teal/coral badges, accent hashtags, hairline-top footer, filled/outline heart states all
  match; badge colors additionally verified by computed style (`#e1f5ee/#085041`, `#faece7/#712b13`).
