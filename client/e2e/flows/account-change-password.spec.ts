import { mockPassword, seedAuthenticatedSession } from '../mocks/fixtures.ts';
import { expect, test } from '../mocks/test.ts';

/*
 * ACCOUNT-3: changing one's own password from Account Settings. The auth handler
 * (e2e/mocks/handlers/auth.ts) mirrors UserController.changePassword: PUT /api/users/me/password
 * answers 200, 400 VALIDATION_FAILED (new password under 8 characters) or 400 CURRENT_PASSWORD_INCORRECT.
 */

async function openChangePasswordDialog(page: import('@playwright/test').Page) {
  await seedAuthenticatedSession(page, '/profile');
  await page.getByRole('button', { name: 'Your account' }).click();
  await page.getByRole('menuitem', { name: 'Account settings' }).click();
  await page.getByRole('dialog', { name: 'Account settings' }).getByRole('button', { name: 'Change password' }).click();
  return page.getByRole('dialog', { name: 'Change your password' });
}

async function fill(dialog: import('@playwright/test').Locator, current: string, next: string, confirm: string) {
  await dialog.getByLabel('Current password', { exact: true }).click();
  await dialog.getByLabel('Current password', { exact: true }).fill(current);
  await dialog.getByLabel('New password', { exact: true }).fill(next);
  await dialog.getByLabel('Confirm new password', { exact: true }).fill(confirm);
}

test('the right current password changes the password, closes the dialog and keeps the user signed in', async ({ page }) => {
  const dialog = await openChangePasswordDialog(page);
  await fill(dialog, mockPassword, 'brand-new-password', 'brand-new-password');

  const request = page.waitForRequest('**/api/users/me/password');
  await dialog.getByRole('button', { name: 'Change password' }).click();

  expect((await request).postDataJSON()).toEqual({ currentPassword: mockPassword, newPassword: 'brand-new-password' });
  await expect(dialog).toBeHidden();
  await expect(page.getByText('Your password was updated.')).toBeVisible();
  await expect(page).toHaveURL(/\/profile/);
  await expect(page.getByRole('dialog', { name: 'Account settings' })).toBeVisible();
});

test('a wrong current password keeps the dialog open with the localized error on that field', async ({ page }) => {
  const dialog = await openChangePasswordDialog(page);
  await fill(dialog, 'definitely-wrong', 'brand-new-password', 'brand-new-password');
  await dialog.getByRole('button', { name: 'Change password' }).click();

  await expect(dialog.getByRole('alert')).toHaveText('Your current password is incorrect.');
  await expect(dialog.getByLabel('Current password', { exact: true })).toHaveAccessibleDescription('Your current password is incorrect.');
  await expect(dialog).toBeVisible();
});

test('a too-short or unconfirmed new password is stopped on the client without a request', async ({ page }) => {
  let calls = 0;
  page.on('request', (request) => {
    if (request.url().includes('/api/users/me/password')) calls += 1;
  });
  const dialog = await openChangePasswordDialog(page);

  await fill(dialog, mockPassword, 'short', 'short');
  await dialog.getByRole('button', { name: 'Change password' }).click();
  await expect(dialog.getByText('Password must be at least 8 characters.')).toBeVisible();

  await dialog.getByLabel('New password', { exact: true }).fill('long-enough-1');
  await dialog.getByLabel('Confirm new password', { exact: true }).fill('long-enough-2');
  await dialog.getByRole('button', { name: 'Change password' }).click();
  await expect(dialog.getByText('The two passwords don’t match.')).toBeVisible();

  expect(calls).toBe(0);
});

test('Esc closes only the dialog, leaving Account settings open', async ({ page }) => {
  const dialog = await openChangePasswordDialog(page);

  await page.keyboard.press('Escape');

  await expect(dialog).toBeHidden();
  await expect(page.getByRole('dialog', { name: 'Account settings' })).toBeVisible();
});
