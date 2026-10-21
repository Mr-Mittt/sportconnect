import {
  mockExpiredCode,
  mockLockedPassword,
  mockPassword,
  mockVerificationCode,
  seedAuthenticatedSession,
} from '../mocks/fixtures.ts';
import { KEYCLOAK_AUTH_URL } from '../mocks/keycloakStub.ts';
import { expect, test } from '../mocks/test.ts';

/*
 * ACCOUNT-4: deactivating one's own account from Account Settings. The auth handler
 * (e2e/mocks/handlers/auth.ts) mirrors backend U22: POST /api/users/me/deactivate answers 200 for the
 * right password and 400 CURRENT_PASSWORD_INCORRECT otherwise.
 */

async function openDeactivateDialog(page: import('@playwright/test').Page) {
  await seedAuthenticatedSession(page, '/profile');
  await page.getByRole('button', { name: 'Your account' }).click();
  await page.getByRole('menuitem', { name: 'Account settings' }).click();
  await page.getByRole('dialog', { name: 'Account settings' }).getByRole('button', { name: 'Deactivate account' }).click();
  return page.getByRole('dialog', { name: 'Deactivate your account?' });
}

test('the right password deactivates, signs out and lands on the sign-in page', async ({ page }) => {
  const dialog = await openDeactivateDialog(page);

  const request = page.waitForRequest('**/api/users/me/deactivate');
  await dialog.getByLabel('Confirm with your password').click();
  await dialog.getByLabel('Confirm with your password').fill(mockPassword);
  await dialog.getByRole('button', { name: 'Deactivate' }).click();

  expect((await request).postDataJSON()).toEqual({ currentPassword: mockPassword });
  // AUTH-14: /login is a redirect, so the signed-out user ends up on Keycloak's sign-in page; the
  // re-activate dialog is shown by /auth/callback after the next sign-in (auth-callback.spec.ts).
  await expect(page).toHaveURL(KEYCLOAK_AUTH_URL);
});

test('a wrong password keeps the dialog open with the localized error', async ({ page }) => {
  const dialog = await openDeactivateDialog(page);

  await dialog.getByLabel('Confirm with your password').click();
  await dialog.getByLabel('Confirm with your password').fill('definitely-wrong');
  await dialog.getByRole('button', { name: 'Deactivate' }).click();

  await expect(dialog.getByRole('alert')).toHaveText('Your current password is incorrect.');
  await expect(page).not.toHaveURL(KEYCLOAK_AUTH_URL);
});

/*
 * ACCOUNT-6 / backend U24: the second way to confirm, a 6-digit code emailed to the account. The mock
 * (auth.ts) accepts `mockVerificationCode`, answers VERIFICATION_CODE_EXPIRED for `mockExpiredCode`
 * and the 429 lock for `mockLockedPassword`. The countdown itself ticks in the unit tests; here the
 * visible result of a send (Resend disabled, "Resend in m:ss") is the check.
 */
test('Verify by email: Send code, a countdown on Resend, then the pasted code deactivates', async ({ page }) => {
  const dialog = await openDeactivateDialog(page);
  await dialog.getByRole('radio', { name: 'A code sent by email' }).check();

  const sendRequest = page.waitForRequest('**/api/users/me/confirmation-code');
  await dialog.getByRole('button', { name: 'Send code' }).click();
  expect((await sendRequest).postDataJSON()).toEqual({ purpose: 'DEACTIVATE' });

  await expect(dialog.getByText('We sent a 6-digit code to your email. It is valid for 15 minutes.')).toBeVisible();
  await expect(dialog.getByRole('button', { name: /^Resend in 0:\d\d$|^Resend in 1:00$/ })).toBeDisabled();

  const request = page.waitForRequest('**/api/users/me/deactivate');
  await dialog.getByLabel('Verification code').fill('123 456');
  expect(mockVerificationCode).toBe('123456');
  await dialog.getByRole('button', { name: 'Deactivate' }).click();

  expect((await request).postDataJSON()).toEqual({ verificationCode: mockVerificationCode });
  await expect(page).toHaveURL(KEYCLOAK_AUTH_URL);
});

test('a wrong code is shown on the code field and the typed code is kept', async ({ page }) => {
  const dialog = await openDeactivateDialog(page);
  await dialog.getByRole('radio', { name: 'A code sent by email' }).check();
  await dialog.getByRole('button', { name: 'Send code' }).click();

  await dialog.getByLabel('Verification code').fill('111111');
  await dialog.getByRole('button', { name: 'Deactivate' }).click();

  await expect(dialog.getByRole('alert')).toHaveText('That code isn’t correct. Check it and try again.');
  await expect(dialog.getByLabel('Verification code')).toHaveValue('111111');
  await expect(page).not.toHaveURL(KEYCLOAK_AUTH_URL);
});

test('an expired code is cleared so a new one can be asked for', async ({ page }) => {
  const dialog = await openDeactivateDialog(page);
  await dialog.getByRole('radio', { name: 'A code sent by email' }).check();
  await dialog.getByRole('button', { name: 'Send code' }).click();

  await dialog.getByLabel('Verification code').fill(mockExpiredCode);
  await dialog.getByRole('button', { name: 'Deactivate' }).click();

  await expect(dialog.getByRole('alert')).toHaveText('This code has expired or was already used. Ask for a new one.');
  await expect(dialog.getByLabel('Verification code')).toHaveValue('');
});

test('a wrong password offers the emailed code as a way out', async ({ page }) => {
  const dialog = await openDeactivateDialog(page);
  await dialog.getByLabel('Confirm with your password').click();
  await dialog.getByLabel('Confirm with your password').fill('definitely-wrong');
  await dialog.getByRole('button', { name: 'Deactivate' }).click();

  await dialog.getByRole('button', { name: 'Use an emailed code instead' }).click();

  await expect(dialog.getByRole('radio', { name: 'A code sent by email' })).toBeChecked();
  await expect(dialog.getByRole('button', { name: 'Send code' })).toBeVisible();
});

test('too many wrong passwords lock the password method for the time left and move to the code', async ({ page }) => {
  const dialog = await openDeactivateDialog(page);
  await dialog.getByLabel('Confirm with your password').click();
  await dialog.getByLabel('Confirm with your password').fill(mockLockedPassword);
  await dialog.getByRole('button', { name: 'Deactivate' }).click();

  await expect(dialog.getByRole('radio', { name: 'My password' })).toBeDisabled();
  await expect(dialog.getByRole('radio', { name: 'A code sent by email' })).toBeChecked();
  await expect(dialog.getByRole('button', { name: 'Send code' })).toBeVisible();
  await expect(dialog.getByText(/Try again in 1[34]:\d\d, or use an emailed code\./)).toBeVisible();
});

test('the confirmation stacks over Account settings, which keeps its edits when Cancel returns to it', async ({ page }) => {
  let calls = 0;
  page.on('request', (request) => {
    if (request.url().includes('/api/users/me/deactivate')) calls += 1;
  });
  await seedAuthenticatedSession(page, '/profile');
  await page.getByRole('button', { name: 'Your account' }).click();
  await page.getByRole('menuitem', { name: 'Account settings' }).click();
  const settings = page.getByRole('dialog', { name: 'Account settings' });
  await settings.getByLabel('Bio').fill('Edited but not saved');
  await settings.getByRole('button', { name: 'Deactivate account' }).click();

  const confirm = page.getByRole('dialog', { name: 'Deactivate your account?' });
  await expect(confirm).toBeVisible();
  // Radix marks everything behind a modal aria-hidden, so look for it including hidden nodes.
  await expect(page.getByRole('dialog', { name: 'Account settings', includeHidden: true })).toBeAttached();

  await confirm.getByRole('button', { name: 'Cancel' }).click();

  await expect(confirm).toBeHidden();
  await expect(settings).toBeVisible();
  await expect(settings.getByLabel('Bio')).toHaveValue('Edited but not saved');
  expect(calls).toBe(0);
});

test('Esc closes only the confirmation, not Account settings underneath', async ({ page }) => {
  const confirm = await openDeactivateDialog(page);

  await page.keyboard.press('Escape');

  await expect(confirm).toBeHidden();
  await expect(page.getByRole('dialog', { name: 'Account settings' })).toBeVisible();
});

test('deactivating with unsaved edits in Account settings signs out without the unsaved-changes prompt', async ({ page }) => {
  await seedAuthenticatedSession(page, '/profile');
  await page.getByRole('button', { name: 'Your account' }).click();
  await page.getByRole('menuitem', { name: 'Account settings' }).click();
  const settings = page.getByRole('dialog', { name: 'Account settings' });
  await settings.getByLabel('Bio').fill('Edited but not saved');
  await settings.getByRole('button', { name: 'Deactivate account' }).click();

  const confirm = page.getByRole('dialog', { name: 'Deactivate your account?' });
  await confirm.getByLabel('Confirm with your password').click();
  await confirm.getByLabel('Confirm with your password').fill(mockPassword);
  await confirm.getByRole('button', { name: 'Deactivate' }).click();

  await expect(page).toHaveURL(KEYCLOAK_AUTH_URL);
  await expect(page.getByRole('dialog', { name: 'Unsaved changes' })).toBeHidden();
});

/*
 * ACCOUNT-7 (owner, 2026-10-21): the "service not available, try again later" line is shared by the
 * three account dialogs. A 503 (Keycloak or Redis unreachable) keeps what was typed and signs nobody out.
 */
const SERVICE_DOWN_BODY = JSON.stringify({
  success: false,
  message: 'Service unavailable',
  errorCode: 'SERVICE_UNAVAILABLE',
  data: null,
  timestamp: '2026-10-21T10:00:00Z',
});

test('a 503 on the deactivation keeps the typed password, shows the try-again-later line and keeps the session', async ({ page }) => {
  await page.route('**/api/users/me/deactivate', (route) =>
    route.fulfill({ status: 503, contentType: 'application/json', body: SERVICE_DOWN_BODY }),
  );
  const dialog = await openDeactivateDialog(page);
  await dialog.getByLabel('Confirm with your password').click();
  await dialog.getByLabel('Confirm with your password').fill(mockPassword);

  await dialog.getByRole('button', { name: 'Deactivate' }).click();

  await expect(dialog.getByRole('alert')).toHaveText('This service isn’t available right now. Try again later.');
  await expect(dialog.getByLabel('Confirm with your password')).toHaveValue(mockPassword);
  await expect(dialog).toBeVisible();
  await expect(page).not.toHaveURL(KEYCLOAK_AUTH_URL);
});

test('a 503 when sending the emailed code shows the try-again-later line and starts no countdown', async ({ page }) => {
  await page.route('**/api/users/me/confirmation-code', (route) =>
    route.fulfill({ status: 503, contentType: 'application/json', body: SERVICE_DOWN_BODY }),
  );
  const dialog = await openDeactivateDialog(page);
  await dialog.getByRole('radio', { name: 'A code sent by email' }).check();

  await dialog.getByRole('button', { name: 'Send code' }).click();

  await expect(dialog.getByRole('alert')).toHaveText('This service isn’t available right now. Try again later.');
  await expect(dialog.getByRole('button', { name: 'Send code' })).toBeEnabled();
  await expect(dialog.getByText(/Resend in/)).toHaveCount(0);
});
