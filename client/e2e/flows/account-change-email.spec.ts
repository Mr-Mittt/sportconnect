import type { Locator, Page } from '@playwright/test';
import {
  mockCodeLimitEmail,
  mockDownEmail,
  mockMyProfile,
  mockPassword,
  mockRaceEmail,
  mockSameAsCurrentEmail,
  mockTakenEmail,
  mockTooSoonEmail,
  mockVerificationCode,
  seedAuthenticatedSession,
  seedUnverifiedEmailOnNextLoad,
} from '../mocks/fixtures.ts';
import { expect, test } from '../mocks/test.ts';

/*
 * ACCOUNT-7 / backend U26 + auth A33: the email row of Account Settings and the change-email dialog.
 * The handlers (e2e/mocks/handlers/friends.ts, next to GET /users/me) mirror the real order: the
 * caller's proof, then the new-address code, then the address; fixtures.ts names the addresses that
 * trigger each refusal. The shared 503 line is proven for all three dialogs (the two ACCOUNT-6 ones in
 * their own specs).
 */

const NEW_ADDRESS = 'new.address@example.com';
const SERVICE_DOWN = {
  success: false,
  message: 'Service unavailable',
  errorCode: 'SERVICE_UNAVAILABLE',
  data: null,
  timestamp: '2026-10-21T10:00:00Z',
};
const TRY_LATER = 'This service isn’t available right now. Try again later.';

async function openAccountSettings(page: Page) {
  await page.getByRole('button', { name: 'Your account' }).click();
  await page.getByRole('menuitem', { name: 'Account settings' }).click();
  return page.getByRole('dialog', { name: 'Account settings' });
}

async function openChangeEmailDialog(page: Page) {
  await seedAuthenticatedSession(page, '/profile');
  const settings = await openAccountSettings(page);
  await settings.getByRole('button', { name: 'Change email' }).click();
  return page.getByRole('dialog', { name: 'Change your email' });
}

async function confirmWithPassword(dialog: Locator, password = mockPassword) {
  await dialog.getByLabel('Confirm with your password').click();
  await dialog.getByLabel('Confirm with your password').fill(password);
}

/** Types the address and presses Verify; the mock mails nothing and answers the real numbers. */
async function verifyAddress(dialog: Locator, address: string) {
  await dialog.getByLabel('New email address').fill(address);
  await dialog.getByRole('button', { name: 'Verify' }).click();
}

test('the email row shows the address as Verified for a verified account', async ({ page }) => {
  await seedAuthenticatedSession(page, '/profile');
  const settings = await openAccountSettings(page);

  await expect(settings.getByText(mockMyProfile.email!)).toBeVisible();
  await expect(settings.getByText('Verified', { exact: true })).toBeVisible();
  await expect(settings.getByRole('button', { name: 'Get verification now' })).toHaveCount(0);
});

test('the right password and the new-address code change the email, close the dialog and show the new address Verified', async ({
  page,
}) => {
  const dialog = await openChangeEmailDialog(page);

  const codeRequest = page.waitForRequest('**/api/users/me/email-change-code');
  await verifyAddress(dialog, NEW_ADDRESS);
  expect((await codeRequest).postDataJSON()).toEqual({ newEmail: NEW_ADDRESS });
  // Verify starts the proof from empty, so the password is typed after it
  await confirmWithPassword(dialog);
  await expect(dialog.getByRole('button', { name: /^Re-send in 1:0\d$/ })).toBeDisabled();
  await expect(dialog.getByText(`We sent a 6-digit code to ${NEW_ADDRESS}.`)).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Update email' })).toBeDisabled();

  await dialog.getByLabel('Code sent to the new address').fill(mockVerificationCode);
  const request = page.waitForRequest((r) => r.url().endsWith('/api/users/me/email') && r.method() === 'PUT');
  await dialog.getByRole('button', { name: 'Update email' }).click();

  expect((await request).postDataJSON()).toEqual({
    newEmail: NEW_ADDRESS,
    newEmailCode: mockVerificationCode,
    currentPassword: mockPassword,
  });
  await expect(dialog).toBeHidden();
  await expect(page.getByText('Your email was updated.')).toBeVisible();
  const settings = page.getByRole('dialog', { name: 'Account settings' });
  await expect(settings.getByText(NEW_ADDRESS)).toBeVisible();
  await expect(settings.getByText('Verified', { exact: true })).toBeVisible();
  // the top bar reads the login snapshot, which the change updated
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Your account' }).click();
  await expect(page.getByRole('menu').getByText(NEW_ADDRESS)).toBeVisible();
});

test('the code emailed to the current address works as the proof', async ({ page }) => {
  const dialog = await openChangeEmailDialog(page);
  await dialog.getByRole('radio', { name: 'A code sent by email' }).check();
  const proofRequest = page.waitForRequest('**/api/users/me/confirmation-code');
  await dialog.getByRole('button', { name: 'Send code' }).click();
  expect((await proofRequest).postDataJSON()).toEqual({ purpose: 'CHANGE_EMAIL' });
  await verifyAddress(dialog, NEW_ADDRESS);
  await dialog.getByLabel('Verification code').fill(mockVerificationCode);
  await dialog.getByLabel('Code sent to the new address').fill(mockVerificationCode);

  const request = page.waitForRequest((r) => r.url().endsWith('/api/users/me/email') && r.method() === 'PUT');
  await dialog.getByRole('button', { name: 'Update email' }).click();

  expect((await request).postDataJSON()).toEqual({
    newEmail: NEW_ADDRESS,
    newEmailCode: mockVerificationCode,
    verificationCode: mockVerificationCode,
  });
  await expect(dialog).toBeHidden();
});

test('a wrong new-address code is shown on that input and everything typed is kept', async ({ page }) => {
  const dialog = await openChangeEmailDialog(page);
  await verifyAddress(dialog, NEW_ADDRESS);
  await confirmWithPassword(dialog);
  await dialog.getByLabel('Code sent to the new address').fill('111111');

  await dialog.getByRole('button', { name: 'Update email' }).click();

  await expect(dialog.getByLabel('Code sent to the new address')).toHaveAccessibleDescription(
    'That code isn’t correct. Check it and try again.',
  );
  await expect(dialog.getByLabel('Code sent to the new address')).toHaveValue('111111');
  await expect(dialog.getByLabel('Confirm with your password')).toHaveValue(mockPassword);
  await expect(dialog.getByLabel('New email address')).toHaveValue(NEW_ADDRESS);
});

test('a wrong code from the current address is shown on the proof code, not on the new-address code', async ({ page }) => {
  const dialog = await openChangeEmailDialog(page);
  await dialog.getByRole('radio', { name: 'A code sent by email' }).check();
  await dialog.getByRole('button', { name: 'Send code' }).click();
  await verifyAddress(dialog, NEW_ADDRESS);
  await dialog.getByLabel('Verification code').fill('111111');
  await dialog.getByLabel('Code sent to the new address').fill(mockVerificationCode);

  await dialog.getByRole('button', { name: 'Update email' }).click();

  await expect(dialog.getByLabel('Verification code')).toHaveAccessibleDescription(
    'That code isn’t correct. Check it and try again.',
  );
  await expect(dialog.getByLabel('Code sent to the new address')).not.toHaveAccessibleDescription(/correct/);
  await expect(dialog.getByLabel('Code sent to the new address')).toHaveValue(mockVerificationCode);
});

test('a wrong password is shown on the password field and the codes are kept', async ({ page }) => {
  const dialog = await openChangeEmailDialog(page);
  await verifyAddress(dialog, NEW_ADDRESS);
  await confirmWithPassword(dialog, 'definitely-wrong');
  await dialog.getByLabel('Code sent to the new address').fill(mockVerificationCode);

  await dialog.getByRole('button', { name: 'Update email' }).click();

  await expect(dialog.getByLabel('Confirm with your password')).toHaveAccessibleDescription('Your current password is incorrect.');
  await expect(dialog.getByLabel('Code sent to the new address')).toHaveValue(mockVerificationCode);
});

test('an address that is already registered is refused when the code is requested', async ({ page }) => {
  const dialog = await openChangeEmailDialog(page);
  await verifyAddress(dialog, mockTakenEmail);

  await expect(dialog.getByLabel('New email address')).toHaveAccessibleDescription(
    'An account with this email already exists. Use another address.',
  );
  await expect(dialog.getByLabel('Code sent to the new address')).toHaveCount(0);
  await expect(dialog.getByRole('button', { name: 'Verify' })).toBeEnabled();
});

test('the account\'s own address is refused, whatever the letter case', async ({ page }) => {
  const dialog = await openChangeEmailDialog(page);
  await verifyAddress(dialog, mockSameAsCurrentEmail);

  await expect(dialog.getByLabel('New email address')).toHaveAccessibleDescription('That is already your email address.');
});

test('an address taken after Verify: the code step closes and its code is cleared, the proof stays', async ({ page }) => {
  const dialog = await openChangeEmailDialog(page);
  await verifyAddress(dialog, mockRaceEmail);
  await confirmWithPassword(dialog);
  await dialog.getByLabel('Code sent to the new address').fill(mockVerificationCode);

  await dialog.getByRole('button', { name: 'Update email' }).click();

  await expect(dialog.getByLabel('New email address')).toHaveAccessibleDescription(
    'An account with this email already exists. Use another address.',
  );
  await expect(dialog.getByLabel('Code sent to the new address')).toHaveCount(0);
  await expect(dialog.getByLabel('Confirm with your password')).toHaveValue(mockPassword);
  await expect(dialog.getByRole('button', { name: 'Update email' })).toBeDisabled();

  // another address starts from Verify again (the 60 s lock still runs, so the button waits)
  await dialog.getByLabel('New email address').fill(NEW_ADDRESS);
  await expect(dialog.getByRole('button', { name: /^Re-send in \d:\d\d$/ })).toBeDisabled();
  await expect(dialog.getByLabel('Code sent to the new address')).toHaveCount(0);
});

test('the resend lock of another address counts down on the button without an error line', async ({ page }) => {
  const dialog = await openChangeEmailDialog(page);
  await verifyAddress(dialog, mockTooSoonEmail);

  await expect(dialog.getByRole('button', { name: /^Re-send in 0:4\d$/ })).toBeDisabled();
  await expect(dialog.getByLabel('New email address')).not.toHaveAccessibleDescription(/./);
  await expect(dialog.getByLabel('Code sent to the new address')).toHaveCount(0);
});

test('the daily limit is told in words and no countdown starts', async ({ page }) => {
  const dialog = await openChangeEmailDialog(page);
  await verifyAddress(dialog, mockCodeLimitEmail);

  await expect(dialog.getByLabel('New email address')).toHaveAccessibleDescription(
    'You’ve requested too many codes today. Try again tomorrow.',
  );
  await expect(dialog.getByRole('button', { name: 'Verify' })).toBeEnabled();
});

test('Re-send clears the typed proof and the typed new-address code, so Update waits for both again', async ({ page }) => {
  // a 1 s lock so the test can press Re-send without waiting a minute
  await page.route('**/api/users/me/email-change-code', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        message: 'Verification code sent',
        data: { resendAfterSeconds: 1, expiresInSeconds: 900 },
        timestamp: '2026-10-21T10:00:00Z',
      }),
    }),
  );
  const dialog = await openChangeEmailDialog(page);
  await verifyAddress(dialog, NEW_ADDRESS);
  await confirmWithPassword(dialog);
  await dialog.getByLabel('Code sent to the new address').fill(mockVerificationCode);
  await expect(dialog.getByRole('button', { name: 'Update email' })).toBeEnabled();

  await dialog.getByRole('button', { name: 'Re-send', exact: true }).click();

  await expect(dialog.getByLabel('Confirm with your password')).toHaveValue('');
  await expect(dialog.getByLabel('Code sent to the new address')).toHaveValue('');
  await expect(dialog.getByRole('button', { name: 'Update email' })).toBeDisabled();
});

test('a 503 when requesting the code shows the try-again-later line and starts no countdown', async ({ page }) => {
  const dialog = await openChangeEmailDialog(page);
  await verifyAddress(dialog, mockDownEmail);

  await expect(dialog.getByLabel('New email address')).toHaveAccessibleDescription(TRY_LATER);
  await expect(dialog.getByRole('button', { name: 'Verify' })).toBeEnabled();
  await expect(dialog.getByLabel('Code sent to the new address')).toHaveCount(0);
});

test('a 503 when updating shows the try-again-later line and keeps every input', async ({ page }) => {
  await page.route(
    (url) => url.pathname === '/api/users/me/email',
    (route) =>
      route.request().method() === 'PUT'
        ? route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify(SERVICE_DOWN) })
        : route.fallback(),
  );
  const dialog = await openChangeEmailDialog(page);
  await verifyAddress(dialog, NEW_ADDRESS);
  await confirmWithPassword(dialog);
  await dialog.getByLabel('Code sent to the new address').fill(mockVerificationCode);

  await dialog.getByRole('button', { name: 'Update email' }).click();

  await expect(dialog.getByRole('alert')).toHaveText(TRY_LATER);
  await expect(dialog.getByLabel('Confirm with your password')).toHaveValue(mockPassword);
  await expect(dialog.getByLabel('Code sent to the new address')).toHaveValue(mockVerificationCode);
  await expect(dialog.getByRole('button', { name: 'Update email' })).toBeEnabled();
});

test('an unverified address offers the verification link, then counts down', async ({ page, mockSessionId }) => {
  await seedUnverifiedEmailOnNextLoad(mockSessionId);
  await seedAuthenticatedSession(page, '/profile');
  const settings = await openAccountSettings(page);
  await expect(settings.getByText('Not verified yet.')).toBeVisible();

  const request = page.waitForRequest('**/api/users/me/email-verification');
  await settings.getByRole('button', { name: 'Get verification now' }).click();

  expect((await request).method()).toBe('POST');
  await expect(settings.getByText(/^Re-send in 1:0\d$/)).toBeVisible();
  await expect(settings.getByText(/valid for 12 hours/)).toBeVisible();
  await expect(settings.getByRole('button', { name: 'Get verification now' })).toHaveCount(0);
});

test('a 503 when asking for the verification mail shows the try-again-later line', async ({ page, mockSessionId }) => {
  await seedUnverifiedEmailOnNextLoad(mockSessionId);
  await page.route('**/api/users/me/email-verification', (route) =>
    route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify(SERVICE_DOWN) }),
  );
  await seedAuthenticatedSession(page, '/profile');
  const settings = await openAccountSettings(page);

  await settings.getByRole('button', { name: 'Get verification now' }).click();

  await expect(settings.getByRole('alert')).toHaveText(TRY_LATER);
});

test('Esc closes only the change-email dialog, leaving Account settings open', async ({ page }) => {
  const dialog = await openChangeEmailDialog(page);

  await page.keyboard.press('Escape');

  await expect(dialog).toBeHidden();
  await expect(page.getByRole('dialog', { name: 'Account settings' })).toBeVisible();
});
