import {
  mockLockedPassword,
  mockPassword,
  mockVerificationCode,
  seedAuthenticatedSession,
} from '../mocks/fixtures.ts';
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

/*
 * ACCOUNT-6 / backend U24: the emailed-code method of the same dialog, the lock, and the Keycloak
 * policy refusal of the new password (the mock refuses 'password1').
 */
test('Verify by email changes the password with the emailed code', async ({ page }) => {
  const dialog = await openChangePasswordDialog(page);
  await dialog.getByRole('radio', { name: 'A code sent by email' }).check();

  const sendRequest = page.waitForRequest('**/api/users/me/confirmation-code');
  await dialog.getByRole('button', { name: 'Send code' }).click();
  expect((await sendRequest).postDataJSON()).toEqual({ purpose: 'CHANGE_PASSWORD' });

  await dialog.getByLabel('Verification code').fill(mockVerificationCode);
  await dialog.getByLabel('New password', { exact: true }).fill('brand-new-password');
  await dialog.getByLabel('Confirm new password', { exact: true }).fill('brand-new-password');
  const request = page.waitForRequest('**/api/users/me/password');
  await dialog.getByRole('button', { name: 'Change password' }).click();

  expect((await request).postDataJSON()).toEqual({ verificationCode: mockVerificationCode, newPassword: 'brand-new-password' });
  await expect(dialog).toBeHidden();
  await expect(page.getByText('Your password was updated.')).toBeVisible();
});

test('a wrong code is shown on the code field and nothing is changed', async ({ page }) => {
  const dialog = await openChangePasswordDialog(page);
  await dialog.getByRole('radio', { name: 'A code sent by email' }).check();
  await dialog.getByRole('button', { name: 'Send code' }).click();
  await dialog.getByLabel('Verification code').fill('111111');
  await dialog.getByLabel('New password', { exact: true }).fill('brand-new-password');
  await dialog.getByLabel('Confirm new password', { exact: true }).fill('brand-new-password');
  await dialog.getByRole('button', { name: 'Change password' }).click();

  await expect(dialog.getByRole('alert')).toHaveText('That code isn’t correct. Check it and try again.');
  await expect(dialog).toBeVisible();
});

test('a new password the realm policy refuses is shown on the new-password field', async ({ page }) => {
  const dialog = await openChangePasswordDialog(page);
  await fill(dialog, mockPassword, 'password1', 'password1');
  await dialog.getByRole('button', { name: 'Change password' }).click();

  await expect(dialog.getByLabel('New password', { exact: true })).toHaveAccessibleDescription(
    'That new password doesn’t meet the password rules. Choose a different one.',
  );
  await expect(dialog).toBeVisible();
});

test('too many wrong passwords lock the password method and move to the code', async ({ page }) => {
  const dialog = await openChangePasswordDialog(page);
  await fill(dialog, mockLockedPassword, 'brand-new-password', 'brand-new-password');
  await dialog.getByRole('button', { name: 'Change password' }).click();

  await expect(dialog.getByRole('radio', { name: 'My password' })).toBeDisabled();
  await expect(dialog.getByRole('radio', { name: 'A code sent by email' })).toBeChecked();
  await expect(dialog.getByText(/Try again in 1[34]:\d\d, or use an emailed code\./)).toBeVisible();
});

test('the password lock is shared: deactivate opens already locked after change password hit it', async ({ page }) => {
  const dialog = await openChangePasswordDialog(page);
  await fill(dialog, mockLockedPassword, 'brand-new-password', 'brand-new-password');
  await dialog.getByRole('button', { name: 'Change password' }).click();
  await expect(dialog.getByRole('radio', { name: 'My password' })).toBeDisabled();

  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await page.getByRole('dialog', { name: 'Account settings' }).getByRole('button', { name: 'Deactivate account' }).click();

  const deactivate = page.getByRole('dialog', { name: 'Deactivate your account?' });
  await expect(deactivate.getByRole('radio', { name: 'My password' })).toBeDisabled();
  await expect(deactivate.getByRole('radio', { name: 'A code sent by email' })).toBeChecked();
  await expect(deactivate.getByText(/Try again in 1[34]:\d\d, or use an emailed code\./)).toBeVisible();
});

test('Esc closes only the dialog, leaving Account settings open', async ({ page }) => {
  const dialog = await openChangePasswordDialog(page);

  await page.keyboard.press('Escape');

  await expect(dialog).toBeHidden();
  await expect(page.getByRole('dialog', { name: 'Account settings' })).toBeVisible();
});

/*
 * ACCOUNT-7 (owner, 2026-10-21): the "service not available, try again later" line is shared by the
 * three account dialogs. A 503 (Keycloak or Redis unreachable) keeps what was typed.
 */
const SERVICE_DOWN_BODY = JSON.stringify({
  success: false,
  message: 'Service unavailable',
  errorCode: 'SERVICE_UNAVAILABLE',
  data: null,
  timestamp: '2026-10-21T10:00:00Z',
});
const TRY_LATER = 'This service isn’t available right now. Try again later.';

test('a 503 on the change keeps the typed passwords and shows the try-again-later line', async ({ page }) => {
  await page.route('**/api/users/me/password', (route) =>
    route.fulfill({ status: 503, contentType: 'application/json', body: SERVICE_DOWN_BODY }),
  );
  const dialog = await openChangePasswordDialog(page);
  await fill(dialog, mockPassword, 'brand-new-password', 'brand-new-password');

  await dialog.getByRole('button', { name: 'Change password' }).click();

  await expect(dialog.getByRole('alert')).toHaveText(TRY_LATER);
  await expect(dialog.getByLabel('Current password', { exact: true })).toHaveValue(mockPassword);
  await expect(dialog.getByLabel('New password', { exact: true })).toHaveValue('brand-new-password');
  await expect(dialog.getByRole('button', { name: 'Change password' })).toBeEnabled();
});

test('a 503 when sending the emailed code shows the try-again-later line and starts no countdown', async ({ page }) => {
  await page.route('**/api/users/me/confirmation-code', (route) =>
    route.fulfill({ status: 503, contentType: 'application/json', body: SERVICE_DOWN_BODY }),
  );
  const dialog = await openChangePasswordDialog(page);
  await dialog.getByRole('radio', { name: 'A code sent by email' }).check();

  await dialog.getByRole('button', { name: 'Send code' }).click();

  await expect(dialog.getByRole('alert')).toHaveText(TRY_LATER);
  await expect(dialog.getByRole('button', { name: 'Send code' })).toBeEnabled();
  await expect(dialog.getByText(/Resend in/)).toHaveCount(0);
});
