# CLIENT-SESSION-11 · Extract a shared `SessionCard` (compact/full size variant)

**Status:** `DONE` (2026-08-15) · **Type:** Refactor (de-dup) · **Filed:** 2026-08-15, raised by the
user while discussing SPORT-4's `SportIcon` reuse, after confirming `UpcomingMatches` (the Home
Feed/Groups/Friends right rail) and `SessionListCard` (the Matches page's card) were two
separately-implemented components, only kept visually in line by hand.

## Problem

`UpcomingMatches.tsx` (`shared/components/`) rendered its own inline card JSX per match — icon
badge, title, status, clock/pin/fee/participant rows, two action buttons — at a smaller size.
`SessionListCard.tsx` (`features/session/components/`) rendered the same structure, larger, plus an
`IconUsers` icon before the participant count the compact version omitted. Both consumed the same
underlying data shape (`SessionListItem extends Session`, with no extra field either component
actually read), so the duplication was purely presentational — a real drift risk, since a future
change to one had no guarantee of being ported to the other (this had already happened once:
CLIENT-SESSION-10's "brought in line for consistency" pass was a manual sync, not structural).

## Decision (confirmed with the user before implementation)

One shared component with a `size: 'compact' | 'full'` prop (default `'full'`) — **not** "make both
the same size." The rail and the Matches page keep their current, intentionally different visual
density. Pure de-duplication: no visual change on either page, one implementation instead of two
kept in line by hand.

## What was built

- **New `shared/components/SessionCard.tsx`** (+ `.stories.tsx`, `.test.tsx`) — the merged
  component. Moved to `shared/` (not `features/session/`) since `UpcomingMatches` — itself a
  shared, cross-page component — needs it too. A `SIZE_STYLES` lookup (one entry per JSX slot that
  actually differs: wrapper classes, header gap, badge/icon sizing, title typography, detail-row
  spacing/color, whether the participant count gets an `IconUsers` icon, action-row margin)
  reproduces each size's exact prior pixel output — verified, not assumed (see Verification below).
- **`UpcomingMatches.tsx`** now renders `<SessionCard size="compact" .../>` per row instead of its
  own inline JSX. Keeps everything `SessionCard` doesn't own: the "Upcoming" header, "See all",
  `maxVisible` capping, the empty-state CTAs, and its own `activeSport` filtering.
- **`SessionDateGroup.tsx`** / **`SessionDiscoverPanel.tsx`** (Matches page's date-grouped list and
  Discover grid) render `<SessionCard size="full" .../>` (the default) instead of `SessionListCard`.
- **`features/session/components/SessionListCard.tsx`** (+ its `.test.tsx`/`.stories.tsx`) deleted.
- **`UpcomingMatches`'s `onSelectMatch` prop renamed to `onViewDetails`** for naming consistency
  with the other 3 call sites of the merged card — `HomeFeedPage`/`GroupsPage`/`FriendsPage`'s
  wiring updated (prop key only; the value, `discoverModalData.onViewDetails`, was already correct).
- Doc-comment references to the retired `SessionListCard` name updated across `feeType.ts`,
  `sessionStatus.ts`, `SessionDetailModal.tsx`, `useDiscoverModalData.ts`, `useMatchesPageData.ts`,
  `SessionDateGroup.tsx`'s own test description.

## Verification

- `tsc -b --noEmit`: clean.
- `pnpm lint`: clean (2 pre-existing unrelated warnings in `SessionStartTimePicker.tsx`).
- `pnpm test`: **838/838 passed** (123 files) — `SessionCard.test.tsx` carries over every
  `SessionListCard.test.tsx` case (title/status/location/participant-count rendering, fee-type
  display, view-details/participation-action clicks, Leave-hidden-for-creator, card-click vs.
  nested-button-click propagation, pending-state disabling) plus a new case asserting identical
  content renders at `size="compact"`.
- `pnpm exec storybook build`: clean, including the new `SessionCard` stories (a `Compact` story
  added alongside the carried-over `Full`/status/fee/participation-state stories).
- `pnpm exec playwright test --project=visual-regression`: same 18 "different" results as after
  SPORT-4 — confirmed by direct diff-image inspection this is pure Windows-vs-Linux font
  anti-aliasing noise (every text glyph highlighted uniformly, zero structural/layout shift), the
  same pattern documented since HF-12. Notably, 9 of the 18 are `app-post-modal.spec.ts` captures,
  which contain no `SessionCard`/`UpcomingMatches` content at all — their diffing at the same ratio
  independently confirms the noise is unrelated to this refactor. **No baseline regeneration
  needed** — this is the first ticket in this repo's history to touch session-card rendering
  without moving any baseline.
- `pnpm e2e`: **49/49 passed**, including `matches-journey.spec.ts` (exercises `SessionCard` at
  `size="full"` via the Matches page) and `home-feed-journey.spec.ts` (exercises it at
  `size="compact"` via the rail) — both confirm the merged component's real behavior end-to-end
  through the mock server, not just unit-level.

No divergence from the approved design — implementation matched the confirmed plan exactly.
