import { seedAuthenticatedSession, seedSoftDeletedSportProfileOnNextLoad } from '../mocks/fixtures.ts';
import { expect, test } from '../mocks/test.ts';

/*
 * SPORT-12: visual-regression coverage for SPORT-10's deactivate/reactivate
 * chrome, which shipped with none — deliberately, per this repo's established
 * pattern of filing a visual-regression harness as its own follow-up ticket
 * (CLIENT-NOTIF-2, CLIENT-SESSION-12, GRP-10, FEED-11). One new file rather
 * than folding into app-profile.spec.ts (PROFILE-7's file) — these surfaces
 * span 3 pages (Profile / Home Feed / Groups), same "own file for a
 * cross-page surface" precedent as app-session-detail-modal.spec.ts /
 * app-notification-bell.spec.ts.
 *
 * 7 states x 3 breakpoints = 21 test instances, all *new* baselines — the 3
 * profile-settings-* baselines SPORT-10 already changed are not this
 * ticket's concern (already regenerated on SPORT-10's own branch, commit
 * 1fb1cf1).
 *
 * Every trigger flow below is copied from the already-passing SPORT-10 e2e
 * functional specs (feed-groups-journey.spec.ts, matches-journey.spec.ts,
 * profile-journey.spec.ts) — same seed helper
 * (seedSoftDeletedSportProfileOnNextLoad, defaults to Pickleball
 * soft-deleted, Badminton stays active), same selectors, just a screenshot
 * added at each proven checkpoint instead of a functional assertion.
 *
 * Dialog states: neither SportProfileStatusConfirmDialog nor
 * ReactivateSportNudgeDialog has a focusable text input or autofocus
 * (onOpenAutoFocus is prevented on both) — unlike
 * app-session-detail-modal.spec.ts's dialogs, there is no blinking-caret
 * flake source to blur away here.
 *
 * The deactivate-confirm assertion targets the "hidden from your active
 * sports" note rather than the dialog's own prompt text — the prompt is
 * rendered twice (a sr-only DialogTitle plus a visible <p>, both the same
 * string), so asserting on it would need a disambiguating .first() for no
 * reason when a second, singly-rendered string already proves the right
 * mode is showing (same choice profile-journey.spec.ts's functional test
 * already made). The reactivate-confirm prompt has no such second string, so
 * it does use .first() on the (necessarily duplicated) prompt text.
 *
 * Clock frozen at the same instant as every other visual spec in this suite,
 * for consistency — none of this content is clock-sensitive.
 */

const FROZEN_TIME = new Date('2026-07-07T19:00:00');
const breakpoints = [375, 768, 1280] as const;

for (const width of breakpoints) {
  test(`profile settings — inactive (read-only) @ ${width}px`, async ({ page, mockSessionId }) => {
    await seedSoftDeletedSportProfileOnNextLoad(mockSessionId); // Pickleball soft-deleted
    await page.clock.setFixedTime(FROZEN_TIME);
    await page.setViewportSize({ width, height: 900 });
    await seedAuthenticatedSession(page, '/profile');

    // The muted "Pickleball" pill opens the Settings tab for it, Inactive + read-only.
    await page.getByRole('button', { name: 'Pickleball' }).click();
    await expect(page.getByRole('switch', { name: /Pickleball profile: Inactive/ })).toBeVisible();
    await expect(page.getByLabel('Skill level')).toBeDisabled();
    await page.evaluate('document.fonts.ready');

    await expect(page).toHaveScreenshot(`profile-settings-inactive-${width}.png`, { fullPage: true });
  });

  test(`sport status confirm dialog — deactivate @ ${width}px`, async ({ page }) => {
    await page.clock.setFixedTime(FROZEN_TIME);
    await page.setViewportSize({ width, height: 900 });
    await seedAuthenticatedSession(page, '/profile');

    await page.getByRole('tab', { name: 'Settings' }).click();
    await page.getByRole('switch', { name: /Badminton profile: Active/ }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText(/hidden from your active sports/)).toBeVisible();
    await page.evaluate('document.fonts.ready');

    await expect(dialog).toHaveScreenshot(`sport-status-confirm-deactivate-${width}.png`);
  });

  test(`sport status confirm dialog — reactivate @ ${width}px`, async ({ page, mockSessionId }) => {
    await seedSoftDeletedSportProfileOnNextLoad(mockSessionId); // Pickleball soft-deleted
    await page.clock.setFixedTime(FROZEN_TIME);
    await page.setViewportSize({ width, height: 900 });
    await seedAuthenticatedSession(page, '/profile');

    await page.getByRole('button', { name: 'Pickleball' }).click();
    await page.getByRole('switch', { name: /Pickleball profile: Inactive/ }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText('Welcome back to Pickleball!').first()).toBeVisible();
    await page.evaluate('document.fonts.ready');

    await expect(dialog).toHaveScreenshot(`sport-status-confirm-reactivate-${width}.png`);
  });

  test(`reactivate nudge dialog — sport-pill @ ${width}px`, async ({ page, mockSessionId }) => {
    await seedSoftDeletedSportProfileOnNextLoad(mockSessionId); // Pickleball soft-deleted
    await page.clock.setFixedTime(FROZEN_TIME);
    await page.setViewportSize({ width, height: 900 });
    await seedAuthenticatedSession(page);

    const filter = page.getByRole('group', { name: 'Sport filter' });
    await filter.getByRole('button', { name: 'Pickleball' }).click();
    const dialog = page.getByRole('dialog');
    await expect(
      dialog.getByText('This sport profile is down. Do you want to bring it up?'),
    ).toBeVisible();
    await page.evaluate('document.fonts.ready');

    await expect(dialog).toHaveScreenshot(`reactivate-nudge-sport-pill-${width}.png`);
  });

  test(`reactivate nudge dialog — group @ ${width}px`, async ({ page, mockSessionId }) => {
    await seedSoftDeletedSportProfileOnNextLoad(mockSessionId); // Pickleball soft-deleted
    await page.clock.setFixedTime(FROZEN_TIME);
    await page.setViewportSize({ width, height: 900 });
    await seedAuthenticatedSession(page, '/groups');

    // "Weekend Tennis Ladder" is a Pickleball group (mockOwnedGroup, sportId 3).
    await page
      .getByRole('group', { name: 'Group filter' })
      .getByRole('button', { name: /Weekend Tennis Ladder/ })
      .click();
    const dialog = page.getByRole('dialog');
    await expect(
      dialog
        .getByText(
          'This is a Pickleball group, but your Pickleball profile is down. Do you want to bring it up?',
        )
        .first(),
    ).toBeVisible();
    await page.evaluate('document.fonts.ready');

    await expect(dialog).toHaveScreenshot(`reactivate-nudge-group-${width}.png`);
  });

  test(`sport switcher — muted pill, plain @ ${width}px`, async ({ page, mockSessionId }) => {
    await seedSoftDeletedSportProfileOnNextLoad(mockSessionId); // Pickleball soft-deleted
    await page.clock.setFixedTime(FROZEN_TIME);
    await page.setViewportSize({ width, height: 900 });
    await seedAuthenticatedSession(page);

    const filter = page.getByRole('group', { name: 'Sport filter' });
    const pickleball = filter.getByRole('button', { name: 'Pickleball' });
    await expect(pickleball).toBeVisible();
    await expect(pickleball).toHaveClass(/text-text-muted/);
    await page.evaluate('document.fonts.ready');

    await expect(filter).toHaveScreenshot(`sport-switcher-muted-plain-${width}.png`);
  });

  test(`sport switcher — muted pill, as active filter @ ${width}px`, async ({
    page,
    mockSessionId,
  }) => {
    await seedSoftDeletedSportProfileOnNextLoad(mockSessionId); // Pickleball soft-deleted
    await page.clock.setFixedTime(FROZEN_TIME);
    await page.setViewportSize({ width, height: 900 });
    await seedAuthenticatedSession(page);

    const filter = page.getByRole('group', { name: 'Sport filter' });
    const pickleball = filter.getByRole('button', { name: 'Pickleball' });
    await pickleball.click();
    const nudge = page.getByRole('dialog');
    await expect(nudge).toBeVisible();
    // "Later" lets the selection through and keeps the pill muted — "Yes" would
    // reactivate it, removing the muted state this baseline exists to capture.
    await nudge.getByRole('button', { name: 'Later' }).click();
    await expect(nudge).toBeHidden();
    await expect(pickleball).toHaveAttribute('aria-pressed', 'true');
    await page.evaluate('document.fonts.ready');

    await expect(filter).toHaveScreenshot(`sport-switcher-muted-selected-${width}.png`);
  });
}
