# HF-6 · GroupBroadcasts — implementation summary

**Ticket:** HF-6 (`client/docs/BACKLOG_MVP.md` #9, spec in `sporthub-home-feed-tickets.md` § HF-6)
**Date:** 2026-07-07
**Status:** DONE

## Approved design

The "Group broadcasts" right-rail card: owner/admin announcements from the user's groups,
read-only rows with a 30px ramp-colored initials avatar, group name + relative time, and the
message line-clamped to two lines. Presentational, spec props
(`broadcasts: GroupBroadcast[]`, `onBroadcastClick(broadcastId)`). Built against mock data;
**FEED-7 de-mocks it** against the already-real `GET /api/posts/broadcast`
(broadcasts are `Post` rows with `postType=GROUP_BROADCAST`).

Decisions confirmed in Phase 1:

1. **Rows are clickable, per the spec** — the mockup renders broadcasts as static divs with no
   handler; the spec's acceptance criteria won. Each row is a full-width borderless button with a
   visible focus ring, visually identical to the mockup baseline.
2. **Stays global** — epic open question #1, same resolution as HF-5: no `activeSport` filtering
   (type has no sport field; groups aren't inherently single-sport).
3. **Empty state** (spec silent): header stays, muted "No broadcasts from your groups."

## What was built

```
src/features/home-feed/components/
  GroupBroadcasts.tsx           card with the shared rail chrome; row buttons with size-7.5
                                ramp avatar (getRampBadgeClasses), name + formatRelativeTime,
                                line-clamp-2 message; empty state
    GroupBroadcasts.stories.tsx Default · LongTextClamped · Empty
    GroupBroadcasts.test.tsx    4 tests (row content incl. computed time, whole-row button,
                                click reports id, empty state)
```

No new types, tokens, data layer, page wiring (HF-7), or E2E/visual-regression changes.

## Key decisions & non-obvious details

- **`line-clamp-2` must not be combined with `block`** — caught by story screenshots during
  verification: `display: block` overrides line-clamp's `display: -webkit-box`, silently
  disabling the clamp (class order in `className` is irrelevant; stylesheet order decides).
  The message span uses `line-clamp-2` alone. Same trap class as HF-3's
  hairline/directional-border stacking — record alongside it.
- Relative time via the shared `formatRelativeTime()` (HF-3 delta explicitly assigns broadcasts
  to it) — no ad-hoc formatting.
- The pale coral/purple avatars are **correct**, not a regression: `coral-50` (#faece7) and
  `purple-50` (#eeedfe) are genuinely near-white at small sizes; verified against the theme
  tokens after they looked washed out in screenshots.
- Button's accessible name is the row's full text (name + time + message), so tests/AT can target
  rows by group name without extra `aria-label`s.

## Verification (all passing)

- `pnpm exec tsc -b` · `pnpm lint` · `pnpm test` (48/48 — 4 new)
- Storybook screenshots of all three stories vs the mockup's broadcasts card. One visual bug
  found and fixed via this check (the block/line-clamp conflict above); re-screenshot confirmed
  the two-line ellipsis.

---

### HF-6 · GroupBroadcasts
**Status:** `DONE` (2026-07-07) · **Type:** Component · **Dependency:** HF-0 · **Spec:** HF epic § HF-6 ·
**Summary:** `client/docs/HF-6_GROUPBROADCASTS.md`

Group avatar + name + line-clamped message rows. Real endpoint already exists
(`GET /api/posts/broadcast` — broadcasts are `Post` rows with `postType=GROUP_BROADCAST`);
de-mocked by FEED-7.

**Deltas for later tickets:**
- **Rows are clickable buttons (user decision, spec wins over mockup's static divs)** —
  `onBroadcastClick(broadcastId)`; HF-7 must wire a handler even if it's a no-op for now.
- **Epic open question #1 resolved for broadcasts too: global**, no `activeSport` prop (matches
  the HF-5 resolution).
- Empty state exists: header + muted "No broadcasts from your groups." — FEED-7 maps an empty
  response here, doesn't hide the card.
- **CSS trap (joins HF-3's list): never combine `line-clamp-*` with `block`** — `display: block`
  overrides line-clamp's `-webkit-box` and silently disables clamping, regardless of class order.
