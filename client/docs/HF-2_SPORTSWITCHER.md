# HF-2 · SportSwitcher — implementation summary

**Ticket:** HF-2 (`client/docs/BACKLOG_MVP.md` #5, spec in `sporthub-home-feed-tickets.md` § HF-2)
**Date:** 2026-07-06
**Status:** DONE

## Approved design

Controlled pill row (the Home Feed's primary filter) as a **shared cross-page component**, with
three decisions confirmed in Phase 1:

1. **Spec-vs-mockup conflict resolved in the mockup's favor:** the spec hides "Add sport" at the
   `maxSports` cap, but the approved mockup (and the committed VR baselines) show it alongside 3
   sport pills. Decision: **always render the pill**; at the cap it becomes `aria-disabled` with an
   explanatory `title` and does **not** fire `onAddSport` (the spec's "fires when < maxSports"
   behavior is preserved — only the visibility rule changed).
2. **Wrap, not scroll** on narrow viewports (`flex-wrap`, matching the 375px baseline) — this
   closes the epic's open question #2 for this component.
3. **Type re-home:** `SportKey`/`SportProfile` moved to `src/shared/types/sport.ts` (shared code
   never imports from features); `features/home-feed/types.ts` re-exports them so HF-0's module
   contract is unchanged for consumers.

## What was built

```
src/shared/
  types/sport.ts                    SportKey + SportProfile (moved from the home-feed feature)
  lib/sportIcons.ts                 getSportIcon(name) — bare Tabler names ('ball-football') →
                                    icon components, IconQuestionMark fallback for unknown sports
  components/SportSwitcher.tsx      controlled; synthetic "All" pill (IconLayoutGrid) + sport pills
                                    + always-visible dashed "Add sport"; aria-pressed on pills
    SportSwitcher.stories.tsx       AllActive · BasketballActive · AtSportCap · BelowCapTwoSports
    SportSwitcher.test.tsx          5 tests (order, onChange keys, controlled-ness, cap behavior)
src/features/home-feed/types.ts     now re-exports the sport types
```

Styling per mockup: `rounded-full bg-surface-1 text-2sm`, padding `px-3 py-1.75`; inactive pills
`border-hairline border-border`; active pill `border-2 border-border-accent font-medium` — the
design system's one approved exception to the hairline rule. Active state is never color-only
(border width + font weight change, plus `aria-pressed`).

## Key decisions & notes

- `getSportIcon` lives in `src/shared/lib/` deliberately — HF-3's sport badge and HF-4's match rows
  need the same name→icon mapping; don't duplicate it.
- `colorRamp` is intentionally **unused** here: the mockup's switcher pills are neutral
  (`surface-1`); ramps color the feed badges and match/broadcast avatars, not the switcher.
- The at-cap "Add sport" pill renders visually identical to the enabled one (mockup parity per the
  Phase 1 decision); state is conveyed via `aria-disabled` + `title`. If product later wants a
  visible disabled treatment, that's a deliberate change to make against the baselines (HF-8/HF-9).

## Verification (all passing)

- `pnpm lint` · `pnpm test` (18/18 — 5 new) · `pnpm build` · `pnpm build-storybook`
- Storybook stories screenshotted and compared against the reference mockup's switcher row:
  2px accent ring, hairline pills, dashed Add pill, and ball icons all match.
