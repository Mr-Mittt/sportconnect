import type { Locator } from '@playwright/test';
import { seedAuthenticatedSession, seedDiscoverVolumeOnNextLoad } from '../mocks/fixtures.ts';
import { expect, test } from '../mocks/test.ts';
import { clipAround, pinDiscoverCountsToDate, settle } from './discoverClip.ts';

/*
 * CLIENT-SESSION-31: visual regression for the `/matches` Discover panel (`SessionDiscoverPanel`) —
 * the coverage gap CLIENT-SESSION-22 recorded ("no spec exists for the Matches page's Discover
 * panel"), written against the UI as CLIENT-SESSION-29/30 left it. Region-scoped
 * (`region "Discover sessions"`), not full-page: the page's own chrome and the "My sessions" panel
 * are covered by other specs' baselines and would only churn these.
 *
 * 8 states, all reached via real seeded MSW data or a live click:
 *  - default: today's section expanded (mockDiscoverableSession, "Weekend 5-a-side"), filter row,
 *    and the caller's own "Requested sessions" above it (mockRequestedSession).
 *  - multi-date: "Tomorrow" ticked in the Date popover -> "Date (2)" trigger + a second, collapsed
 *    section header (CLIENT-SESSION-22).
 *  - empty: a title search that matches nothing -> the per-section empty text.
 *  - load-more: `discoverVolume` override (25 synthetic sessions) -> first 10 cards + "Load more".
 *  - requested: `region "Requested sessions"` alone (CLIENT-SESSION-29/30) — its own baseline so a
 *    change to that section is not lost inside the taller default frame.
 *  - date/time/location popover: each open, framed with the region via `clipAround`.
 *
 * /matches defaults to the caller's first sport profile (Badminton, CLIENT-SESSION-29 dropped the
 * "All" pill), which owns both discoverable and requested fixtures, so no pill switch is needed.
 * Popovers are opened by click; on this page there is no Dialog, so Escape is safe for the
 * multi-date step's popover (Escape inside a Dialog, CLIENT-SESSION-27, is fixed too).
 *
 * Clock frozen at the same instant as every other visual-regression spec in this suite.
 */

const FROZEN_TIME = new Date('2026-07-07T19:00:00');
const FROZEN_TODAY = '2026-07-07';
const breakpoints = [375, 768, 1280] as const;

// See `pinDiscoverCountsToDate` — without it every frame's section header reads "Today (0)".
test.beforeEach(async ({ page }) => {
  await pinDiscoverCountsToDate(page, FROZEN_TODAY);
});

/** Both card lists rendered — the popover states measure the region once for `clipAround`, so it
 * must not still be growing as cards land. */
async function waitForPanelLoaded(panel: Locator): Promise<void> {
  await expect(panel.getByText('Wednesday scrimmage')).toBeVisible();
  await expect(panel.getByText('Weekend 5-a-side')).toBeVisible();
}

for (const width of breakpoints) {
  test(`discover panel — default @ ${width}px`, async ({ page }) => {
    await page.clock.setFixedTime(FROZEN_TIME);
    await page.setViewportSize({ width, height: 900 });
    await seedAuthenticatedSession(page, '/matches');

    const panel = page.getByRole('region', { name: 'Discover sessions' });
    await expect(panel.getByText('Weekend 5-a-side')).toBeVisible();
    await expect(panel.getByRole('region', { name: 'Requested sessions' })).toBeVisible();
    await page.evaluate('document.activeElement && document.activeElement.blur()');
    await settle(page);

    await expect(panel).toHaveScreenshot(`discover-panel-default-${width}.png`);
  });

  test(`discover panel — multi-date (collapsed second section) @ ${width}px`, async ({ page }) => {
    await page.clock.setFixedTime(FROZEN_TIME);
    await page.setViewportSize({ width, height: 900 });
    await seedAuthenticatedSession(page, '/matches');

    const panel = page.getByRole('region', { name: 'Discover sessions' });
    await panel.getByRole('button', { name: 'Today', exact: true }).click();
    await page
      .getByRole('checkbox', { name: /^Tomorrow \(\d{1,2}(st|nd|rd|th) [A-Za-z]{3}\)$/ })
      .check();
    await page.keyboard.press('Escape');
    await expect(panel.getByRole('button', { name: 'Date (2)' })).toBeVisible();
    await expect(panel.getByRole('button', { name: /Expand Tomorrow \(\d+\)/ })).toBeVisible();
    // Both queries are in flight after a date change — wait them out so the frame isn't a loading state.
    await expect(panel.getByText('Loading session counts…')).toHaveCount(0);
    await expect(panel.getByText('Loading…', { exact: true })).toHaveCount(0);
    await expect(panel.getByText('Weekend 5-a-side')).toBeVisible();
    await page.evaluate('document.activeElement && document.activeElement.blur()');
    await settle(page);

    await expect(panel).toHaveScreenshot(`discover-panel-multi-date-${width}.png`);
  });

  test(`discover panel — empty (no results) @ ${width}px`, async ({ page }) => {
    await page.clock.setFixedTime(FROZEN_TIME);
    await page.setViewportSize({ width, height: 900 });
    await seedAuthenticatedSession(page, '/matches');

    const panel = page.getByRole('region', { name: 'Discover sessions' });
    await panel.getByRole('textbox', { name: 'Search sessions' }).fill('zzz-no-match');
    // Debounced before the real GET /sessions/discover?title=... fires.
    await expect(panel.getByText('No sessions to discover on Today.')).toBeVisible();
    await page.evaluate('document.activeElement && document.activeElement.blur()');
    await settle(page);

    await expect(panel).toHaveScreenshot(`discover-panel-empty-${width}.png`);
  });

  test(`discover panel — load-more @ ${width}px`, async ({ page, mockSessionId }) => {
    await seedDiscoverVolumeOnNextLoad(mockSessionId);
    await page.clock.setFixedTime(FROZEN_TIME);
    await page.setViewportSize({ width, height: 900 });
    await seedAuthenticatedSession(page, '/matches');

    const panel = page.getByRole('region', { name: 'Discover sessions' });
    await expect(panel.getByRole('button', { name: 'Load more' })).toBeVisible();
    await page.evaluate('document.activeElement && document.activeElement.blur()');
    await settle(page);

    await expect(panel).toHaveScreenshot(`discover-panel-load-more-${width}.png`);
  });

  test(`discover panel — requested sessions section @ ${width}px`, async ({ page }) => {
    await page.clock.setFixedTime(FROZEN_TIME);
    await page.setViewportSize({ width, height: 900 });
    await seedAuthenticatedSession(page, '/matches');

    const requested = page.getByRole('region', { name: 'Requested sessions' });
    await expect(requested.getByText('Wednesday scrimmage')).toBeVisible();
    await expect(requested.getByRole('button', { name: /Wednesday scrimmage.*Cancel/s })).toBeVisible();
    await page.evaluate('document.activeElement && document.activeElement.blur()');
    await settle(page);

    await expect(requested).toHaveScreenshot(`discover-requested-${width}.png`);
  });

  test(`discover panel — date popover open @ ${width}px`, async ({ page }) => {
    await page.clock.setFixedTime(FROZEN_TIME);
    await page.setViewportSize({ width, height: 900 });
    await seedAuthenticatedSession(page, '/matches');

    const panel = page.getByRole('region', { name: 'Discover sessions' });
    await waitForPanelLoaded(panel);
    await panel.getByRole('button', { name: 'Today', exact: true }).click();
    const popover = page.locator('[data-slot="popover-content"]');
    await expect(popover).toBeVisible();
    await settle(page);

    await expect(page).toHaveScreenshot(`discover-panel-date-popover-${width}.png`, {
      fullPage: true,
      clip: await clipAround(page, panel, popover),
    });
  });

  test(`discover panel — time popover open @ ${width}px`, async ({ page }) => {
    await page.clock.setFixedTime(FROZEN_TIME);
    await page.setViewportSize({ width, height: 900 });
    await seedAuthenticatedSession(page, '/matches');

    const panel = page.getByRole('region', { name: 'Discover sessions' });
    await waitForPanelLoaded(panel);
    await panel.getByRole('button', { name: 'Time', exact: true }).click();
    const popover = page.locator('[data-slot="popover-content"]');
    await expect(popover.getByRole('button', { name: 'Before', exact: true })).toBeVisible();
    await settle(page);

    await expect(page).toHaveScreenshot(`discover-panel-time-popover-${width}.png`, {
      fullPage: true,
      clip: await clipAround(page, panel, popover),
    });
  });

  test(`discover panel — location popover open @ ${width}px`, async ({ page }) => {
    await page.clock.setFixedTime(FROZEN_TIME);
    await page.setViewportSize({ width, height: 900 });
    await seedAuthenticatedSession(page, '/matches');

    const panel = page.getByRole('region', { name: 'Discover sessions' });
    await waitForPanelLoaded(panel);
    await panel.getByRole('button', { name: /^Location/ }).click();
    const popover = page.locator('[data-slot="popover-content"]');
    await expect(popover.getByLabel('Search locations')).toBeVisible();
    // The search input autofocuses/blinks a caret — take focus off it so the frame is stable.
    await page.evaluate('document.activeElement && document.activeElement.blur()');
    await settle(page);

    await expect(page).toHaveScreenshot(`discover-panel-location-popover-${width}.png`, {
      fullPage: true,
      clip: await clipAround(page, panel, popover),
    });
  });
}
