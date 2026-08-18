# HF-8 · Responsive and accessibility pass — implementation summary

**Ticket:** HF-8 (`client/docs/BACKLOG_MVP.md` #11, spec in `sporthub-home-feed-tickets.md` § HF-8)
**Date:** 2026-07-07
**Status:** DONE

## Approved design

Hardening pass over the assembled Home Feed, two user decisions up front:

1. **The checks are a committed Playwright spec**, not a one-off audit — `e2e/flows/a11y.spec.ts`
   (new dev dependency `@axe-core/playwright`, the same axe engine Storybook's addon-a11y uses)
   asserts at 375/768/1280px: no horizontal page overflow, and zero critical/serious axe
   violations; plus one axe pass on the sport-filtered state.
2. **Token adjustment allowed** if a color combination fails WCAG AA.

## Audit results

| Check | Result |
|---|---|
| Sport ramp combos (teal/coral/purple -800 on -50) | **Pass** — 8.28 / 8.86 / 8.89, comfortably above 4.5:1 |
| text-primary/secondary/accent/danger on their surfaces | Pass (5.6–17.4) |
| **text-muted #888780** | **FAIL** — 3.61 on white, 3.36 on surface-0 (11–13px text: timestamps, counts, full-CTA, empty states; axe rates this *serious*) |
| Icon-only TopBar buttons | Already labeled (HF-1) — no change |
| Keyboard order + focus rings (scripted tab-through, 28 stops) | Pass — TopBar → NavTabs → pills → posts (likes/hashtags) → rail CTAs, visible ring on every stop |
| **375px horizontal overflow** | **FAIL** — NavTabs' five tabs need 424px (mockup was never tested below its fixed 680px) |

## Fixes

1. **`--color-text-muted: #888780 → #6e6d66`** in `src/index.css` — same warm-gray hue, now
   4.84:1 (surface-0) / 5.20:1 (white). Applied to the reference mockup's `--text-muted` too, and
   **all 9 HF-10a baselines regenerated** from the updated reference (`pnpm test:visual
   --update-snapshots`) so HF-10b diffs stay 1:1. Muted text app-wide is slightly darker.
2. **NavTabs**: `overflow-x-auto` on the nav, `shrink-0` on tabs — the row scrolls within itself
   on narrow screens instead of the page overflowing sideways.
3. **`sr-only` h1 "Home Feed"** on HomeFeedPage — the rail cards introduce h2s with no page h1
   (axe moderate; also restores the accessible heading `smoke.spec.ts` asserts, which HF-7's
   placeholder removal had silently broken — the e2e suite hadn't been run since).

## Non-obvious details

- `page.evaluate` in e2e specs takes a **string**, not a callback — the e2e tsconfig has no DOM
  lib (established by HF-10a's `'document.fonts.ready'`); a callback typechecks only in Vitest
  files.
- `@axe-core/playwright` must be imported as the **named** `AxeBuilder` export — the default
  import runs but fails `tsc -b` under this module resolution.
- The gate filters axe violations to `critical`/`serious` — moderate findings (e.g. future
  heading-order drift) inform but don't fail, per the ticket's acceptance bar.

## Verification (all passing)

- `pnpm e2e` 8/8 (3× overflow + 3× axe + filtered-state axe + smoke) · `pnpm test:visual` 9/9
  against the regenerated baselines · `pnpm test` 55/55 · `pnpm exec tsc -b` · `pnpm lint`
- Scripted keyboard walk reviewed stop-by-stop (order + ring visibility logged).

---

### HF-8 · Responsive and accessibility pass
**Status:** `DONE` (2026-07-07) · **Type:** Hardening · **Dependency:** HF-7 · **Spec:** HF epic § HF-8 ·
**Summary:** `client/docs/HF-8_RESPONSIVE_A11Y_PASS.md`

375/768/1280px, pill wrapping, WCAG AA contrast on all sport-ramp combinations, full keyboard nav,
axe scan with no critical/serious violations.

**Deltas for later tickets:**
- **`--color-text-muted` is now #6e6d66** (was the mockup's #888780 — 3.4:1, failed AA). The
  reference HTML was updated to match and **all 9 HF-10a baselines were regenerated** — HF-10b
  diffs against the regenerated set; don't "restore" the old value from an outdated mockup copy.
- **A11y gate is a committed spec** (`e2e/flows/a11y.spec.ts`, runs in the `e2e` project):
  overflow + axe critical/serious at 3 breakpoints. New pages should extend it, not fork it.
- NavTabs scrolls horizontally within itself below ~424px (`overflow-x-auto` + `shrink-0` tabs).
- HomeFeedPage has an `sr-only` h1 "Home Feed" — this is what `smoke.spec.ts`'s heading assertion
  matches (HF-7's placeholder removal had silently broken it; e2e hadn't been run since).
- e2e specs: `page.evaluate` takes a string (no DOM lib in the e2e tsconfig); import the named
  `AxeBuilder`, not the default.
