import { seedAuthenticatedSession, seedEmptyUpcomingMatchesOnNextLoad } from '../mocks/fixtures.ts';
import { expect, test } from '../mocks/test.ts';
import { clipAround, settle } from './discoverClip.ts';

/*
 * CLIENT-SESSION-31: dialog-scoped visual regression for `SessionDiscoverModal` (the rail's "Join a
 * match" entry point, titled "Discover today session"), same harness shape as
 * app-session-detail-modal.spec.ts (CLIENT-SESSION-12) — `getByRole('dialog', { name })`, 3
 * breakpoints, frozen clock.
 *
 * Reached the way home-feed-journey.spec.ts reaches it: the rail's "Join a match" CTA only renders
 * in `UpcomingMatches`' empty state, and the fixture user always has upcoming sessions, so
 * `seedEmptyUpcomingMatchesOnNextLoad` (the existing `sessionsEmpty` override) empties the rail
 * first. The Badminton pill is picked before opening, as that journey does, so the modal's sport
 * is Badminton (which owns mockDiscoverableSession).
 *
 * 4 states:
 *  - default: today's flat list (mockDiscoverableSession), filter row, "Discover more" footer.
 *  - empty: a title search that matches nothing -> "No sessions to discover today."
 *  - time-popover / location-popover: each open *inside* the modal, framed via `clipAround` since
 *    the popover portals into the dialog's own Content node (CLIENT-SESSION-29) and can overhang
 *    it. This is the layering CLIENT-SESSION-22's pointer-events bug lived in.
 *
 * No Date pill in this modal — it is today-only (CLIENT-SESSION-22 delta) — so no date-popover
 * state here; the Date popover is covered by app-discover-panel.spec.ts. Popovers are opened by
 * click and never dismissed with Escape: that closes the whole modal (CLIENT-SESSION-27, open).
 */

const FROZEN_TIME = new Date('2026-07-07T19:00:00');
const breakpoints = [375, 768, 1280] as const;

for (const width of breakpoints) {
  test(`discover modal — default @ ${width}px`, async ({ page, mockSessionId }) => {
    await seedEmptyUpcomingMatchesOnNextLoad(mockSessionId);
    await page.clock.setFixedTime(FROZEN_TIME);
    await page.setViewportSize({ width, height: 900 });
    await seedAuthenticatedSession(page);

    await page.getByRole('button', { name: 'Badminton' }).click();
    await page.getByRole('button', { name: 'Join a match' }).click();
    const dialog = page.getByRole('dialog', { name: 'Discover today session' });
    await expect(dialog.getByText('Weekend 5-a-side')).toBeVisible();
    await page.evaluate('document.activeElement && document.activeElement.blur()');
    await settle(page);

    await expect(dialog).toHaveScreenshot(`discover-modal-default-${width}.png`);
  });

  test(`discover modal — empty (no results) @ ${width}px`, async ({ page, mockSessionId }) => {
    await seedEmptyUpcomingMatchesOnNextLoad(mockSessionId);
    await page.clock.setFixedTime(FROZEN_TIME);
    await page.setViewportSize({ width, height: 900 });
    await seedAuthenticatedSession(page);

    await page.getByRole('button', { name: 'Badminton' }).click();
    await page.getByRole('button', { name: 'Join a match' }).click();
    const dialog = page.getByRole('dialog', { name: 'Discover today session' });
    await dialog.getByRole('textbox', { name: 'Search sessions' }).fill('zzz-no-match');
    // Debounced before the real GET /sessions/discover?title=... fires.
    await expect(dialog.getByText('No sessions to discover today.')).toBeVisible();
    await page.evaluate('document.activeElement && document.activeElement.blur()');
    await settle(page);

    await expect(dialog).toHaveScreenshot(`discover-modal-empty-${width}.png`);
  });

  test(`discover modal — time popover open @ ${width}px`, async ({ page, mockSessionId }) => {
    await seedEmptyUpcomingMatchesOnNextLoad(mockSessionId);
    await page.clock.setFixedTime(FROZEN_TIME);
    await page.setViewportSize({ width, height: 900 });
    await seedAuthenticatedSession(page);

    await page.getByRole('button', { name: 'Badminton' }).click();
    await page.getByRole('button', { name: 'Join a match' }).click();
    const dialog = page.getByRole('dialog', { name: 'Discover today session' });
    await expect(dialog.getByText('Weekend 5-a-side')).toBeVisible();
    await dialog.getByRole('button', { name: 'Time', exact: true }).click();
    const popover = dialog.locator('[data-slot="popover-content"]');
    await expect(popover.getByRole('button', { name: 'Before', exact: true })).toBeVisible();
    await settle(page);

    await expect(page).toHaveScreenshot(`discover-modal-time-popover-${width}.png`, {
      fullPage: true,
      clip: await clipAround(page, dialog, popover),
    });
  });

  test(`discover modal — location popover open @ ${width}px`, async ({ page, mockSessionId }) => {
    await seedEmptyUpcomingMatchesOnNextLoad(mockSessionId);
    await page.clock.setFixedTime(FROZEN_TIME);
    await page.setViewportSize({ width, height: 900 });
    await seedAuthenticatedSession(page);

    await page.getByRole('button', { name: 'Badminton' }).click();
    await page.getByRole('button', { name: 'Join a match' }).click();
    const dialog = page.getByRole('dialog', { name: 'Discover today session' });
    await expect(dialog.getByText('Weekend 5-a-side')).toBeVisible();
    await dialog.getByRole('button', { name: /^Location/ }).click();
    const popover = dialog.locator('[data-slot="popover-content"]');
    await expect(popover.getByLabel('Search locations')).toBeVisible();
    await page.evaluate('document.activeElement && document.activeElement.blur()');
    await settle(page);

    await expect(page).toHaveScreenshot(`discover-modal-location-popover-${width}.png`, {
      fullPage: true,
      clip: await clipAround(page, dialog, popover),
    });
  });
}
