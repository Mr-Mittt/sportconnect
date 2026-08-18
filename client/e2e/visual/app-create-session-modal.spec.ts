import { mockLocation, seedAuthenticatedSession, seedZeroSportProfilesOnNextLoad } from '../mocks/fixtures.ts';
import { expect, test } from '../mocks/test.ts';

/*
 * CLIENT-SESSION-12: dialog-scoped visual regression for CreateSessionModal, same shape as
 * app-session-detail-modal.spec.ts (dialog-scoped, not full-page, 3 breakpoints).
 *
 * 3 states:
 *  - default: freshly opened, empty form.
 *  - location-chosen: sport selected + a location searched and picked via the real LocationPicker
 *    flow (matches-journey.spec.ts's own established recipe), title/duration/open-slot filled.
 *  - no-sport-profiles: MatchesPage's own zero-profile gate auto-prompts AddSportModal on load
 *    (closed first, not the state under test here) — the state under test is
 *    CreateSessionModal's own internal "add a sport first" prompt, shown when opened with zero
 *    sport profiles.
 *
 * Clock frozen at the same instant as every other visual-regression spec in this suite — this
 * modal pre-fills "Starts at" to today/one-hour-from-now (CLIENT-SESSION-2), which needs a frozen
 * clock to render deterministically.
 */

const FROZEN_TIME = new Date('2026-07-07T19:00:00');
const breakpoints = [375, 768, 1280] as const;

for (const width of breakpoints) {
  test(`create session modal — default @ ${width}px`, async ({ page }) => {
    await page.clock.setFixedTime(FROZEN_TIME);
    await page.setViewportSize({ width, height: 900 });
    await seedAuthenticatedSession(page, '/matches');

    await page.getByRole('button', { name: 'Create session' }).click();
    const dialog = page.getByRole('dialog', { name: 'Create your session' });
    await expect(dialog.getByLabel(/^Sport/)).toBeVisible();
    await page.evaluate('document.activeElement && document.activeElement.blur()');
    await page.evaluate('document.fonts.ready');

    await expect(dialog).toHaveScreenshot(`create-session-default-${width}.png`);
  });

  test(`create session modal — location-chosen @ ${width}px`, async ({ page }) => {
    await page.clock.setFixedTime(FROZEN_TIME);
    await page.setViewportSize({ width, height: 900 });
    await seedAuthenticatedSession(page, '/matches');

    await page.getByRole('button', { name: 'Create session' }).click();
    const dialog = page.getByRole('dialog', { name: 'Create your session' });
    await dialog.getByLabel(/^Sport/).selectOption('pickleball');

    await dialog.getByRole('button', { name: 'Choose location' }).click();
    await page.getByRole('menuitem', { name: 'Choose a location…' }).click();
    const locationDialog = page.getByRole('dialog', { name: 'Choose a location' });
    await locationDialog.getByLabel('Search locations').fill('Riverside');
    await locationDialog.getByRole('button', { name: 'Search' }).click();
    await locationDialog.getByText(mockLocation.name, { exact: true }).click();
    await expect(dialog.getByText(mockLocation.name)).toBeVisible();

    await dialog.getByLabel(/^Session title/).fill('New pickup game');
    await dialog.getByLabel(/^Duration in minutes/).fill('90');
    await dialog.getByLabel(/^Open slot/).fill('10');
    await page.evaluate('document.activeElement && document.activeElement.blur()');
    await page.evaluate('document.fonts.ready');

    await expect(dialog).toHaveScreenshot(`create-session-location-chosen-${width}.png`);
  });

  test(`create session modal — no-sport-profiles (gate) @ ${width}px`, async ({ page, mockSessionId }) => {
    await page.clock.setFixedTime(FROZEN_TIME);
    await page.setViewportSize({ width, height: 900 });
    await seedZeroSportProfilesOnNextLoad(mockSessionId);
    await seedAuthenticatedSession(page, '/matches');

    // MatchesPage's own page-access gate auto-prompts the same AddSportModal on zero profiles —
    // close it first; the state under test is CreateSessionModal's own internal gate, not this one.
    await page.getByRole('dialog', { name: 'Add a sport' }).getByRole('button', { name: 'Close' }).click();

    await page.getByRole('button', { name: 'Create session' }).click();
    const dialog = page.getByRole('dialog', { name: 'Create your session' });
    await expect(dialog.getByText(/add a sport first/)).toBeVisible();
    await page.evaluate('document.activeElement && document.activeElement.blur()');
    await page.evaluate('document.fonts.ready');

    await expect(dialog).toHaveScreenshot(`create-session-no-sport-profiles-${width}.png`);
  });
}
