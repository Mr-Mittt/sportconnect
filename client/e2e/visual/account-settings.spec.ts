import { seedAuthenticatedSession } from '../mocks/fixtures.ts';
import { expect, test } from '../mocks/test.ts';

/*
 * AUTH-13 (scope change at pickup): visual-regression coverage for the Account Settings modal and
 * the two dialogs stacked on it — ACCOUNT-3's change-password and ACCOUNT-4's deactivate — which
 * shipped with none. 3 states x 3 breakpoints = 9 test instances, all *new* baselines, generated
 * by the `update-baselines` GitHub dispatch.
 *
 * Trigger copied from account-settings-unsaved.spec.ts: avatar menu -> "Account settings". Only
 * the initial state of each dialog is shot; error and validation states are out of scope.
 * Dialog shots capture the stacked dialog alone (same choice as the sport status confirm dialogs).
 */

const FROZEN_TIME = new Date('2026-07-07T19:00:00');
const breakpoints = [375, 768, 1280] as const;

async function openAccountSettings(page: import('@playwright/test').Page, width: number) {
  await page.clock.setFixedTime(FROZEN_TIME);
  await page.setViewportSize({ width, height: 900 });
  await seedAuthenticatedSession(page, '/profile');
  await page.getByRole('button', { name: 'Your account' }).click();
  await page.getByRole('menuitem', { name: 'Account settings' }).click();
  const settings = page.getByRole('dialog', { name: 'Account settings' });
  await expect(settings).toBeVisible();
  // Language/Country are pre-filled by async detection (useGeoLocale) — shoot only once they have settled,
  // otherwise the Language select flips between its placeholder and the detected value mid-shot.
  await expect(settings.getByLabel('Language')).not.toHaveValue('');
  await page.waitForLoadState('networkidle');
  return settings;
}

async function settle(page: import('@playwright/test').Page) {
  await page.evaluate('document.activeElement?.blur()');
  await page.evaluate('document.fonts.ready');
}

for (const width of breakpoints) {
  test(`account settings modal — default @ ${width}px`, async ({ page }) => {
    const settings = await openAccountSettings(page, width);
    await settle(page);

    await expect(settings).toHaveScreenshot(`account-settings-default-${width}.png`, { animations: 'disabled' });
  });

  test(`account settings — change password dialog @ ${width}px`, async ({ page }) => {
    const settings = await openAccountSettings(page, width);
    await settings.getByRole('button', { name: 'Change password' }).click();
    const dialog = page.getByRole('dialog', { name: 'Change your password' });
    await expect(dialog).toBeVisible();
    await settle(page);

    await expect(dialog).toHaveScreenshot(`account-settings-change-password-${width}.png`, { animations: 'disabled' });
  });

  test(`account settings — deactivate dialog @ ${width}px`, async ({ page }) => {
    const settings = await openAccountSettings(page, width);
    await settings.getByRole('button', { name: 'Deactivate account' }).click();
    const dialog = page.getByRole('dialog', { name: 'Deactivate your account?' });
    await expect(dialog).toBeVisible();
    await settle(page);

    await expect(dialog).toHaveScreenshot(`account-settings-deactivate-${width}.png`, { animations: 'disabled' });
  });
}
