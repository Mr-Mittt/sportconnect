import { expect, test } from '@playwright/test';

/*
 * HF-10b: full-page visual regression of the REAL HomeFeedPage.
 *
 * Baselines under __screenshots__/ are captures of this page (same 9 names
 * HF-10a introduced). They originally came from the design mockup; after the
 * one-time human parity review (see HF-10b's summary doc) they were re-taken
 * from the app itself, because the mockup can never pixel-match the app
 * (hardcoded vs computed match times, webfont vs SVG icons). The gate is
 * therefore self-regression at a tight threshold: any unintended visual drift
 * fails; intended changes regenerate via `pnpm test:visual --update-snapshots`.
 *
 * The clock is frozen so mock timestamps ("2h ago", "Tomorrow, 7:00 PM")
 * render identically on every run. The empty state uses the ?visual-state
 * seam in useHomeFeedData's mock internals (no mock sport is empty) — when
 * FEED-1 de-mocks the hook, replace it with MSW handlers.
 *
 * NOTE: baselines are OS-specific (font rendering). The committed set is
 * regenerated on Linux via the client-ci workflow's update-baselines input —
 * see the CI bootstrap section of HF-10B_VISUAL_REGRESSION_CI_GATE.md.
 */

const FROZEN_TIME = new Date('2026-07-07T19:00:00');
const breakpoints = [375, 768, 1280] as const;

const states = [
  { name: 'default', query: '', filterTo: null },
  { name: 'basketball', query: '', filterTo: 'Basketball' },
  { name: 'empty', query: '?visual-state=empty', filterTo: null },
] as const;

for (const width of breakpoints) {
  for (const state of states) {
    test(`home feed — ${state.name} @ ${width}px`, async ({ page }) => {
      await page.clock.setFixedTime(FROZEN_TIME);
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`/${state.query}`);

      if (state.name === 'empty') {
        await expect(page.getByText('No posts yet for this sport.')).toBeVisible();
      } else {
        await expect(page.getByRole('article').first()).toBeVisible();
      }
      if (state.filterTo !== null) {
        await page.getByRole('button', { name: state.filterTo, exact: true }).click();
        await expect(page.getByRole('article')).toHaveCount(1);
      }
      await page.evaluate('document.fonts.ready');

      await expect(page).toHaveScreenshot(`home-feed-${state.name}-${width}.png`, {
        fullPage: true,
      });
    });
  }
}
