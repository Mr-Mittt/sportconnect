import { mockDeactivatedEmail, mockPassword } from '../mocks/fixtures.ts';
import { expect, test } from '../mocks/test.ts';

/*
 * AUTH-10: a login that answers ACCOUNT_DEACTIVATED opens a confirm dialog that re-uses the
 * credentials just typed. The auth handler (e2e/mocks/handlers/auth.ts) mirrors backend A9:
 * `mockDeactivatedEmail` + the right password -> 401 ACCOUNT_DEACTIVATED on /auth/login, and
 * POST /auth/reactivate logs that account in.
 */

async function submitDeactivatedLogin(page: import('@playwright/test').Page, password = mockPassword) {
  await page.goto('/login');
  await page.locator('#login-email').fill(mockDeactivatedEmail);
  await page.locator('#login-password').fill(password);
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
}

test.describe('re-activate a deactivated account on login', () => {
  test('confirm re-sends the typed credentials and lands in the app', async ({ page }) => {
    await submitDeactivatedLogin(page);

    const dialog = page.getByRole('dialog', { name: 'Re-activate your account?' });
    await expect(dialog).toBeVisible();

    const reactivateRequest = page.waitForRequest('**/api/auth/reactivate');
    await dialog.getByRole('button', { name: 'Re-activate' }).click();

    expect((await reactivateRequest).postDataJSON()).toEqual({ email: mockDeactivatedEmail, password: mockPassword });
    await expect(page).not.toHaveURL(/\/login/);
  });

  test('decline sends nothing and leaves the user on the login form', async ({ page }) => {
    let reactivateCalls = 0;
    page.on('request', (request) => {
      if (request.url().includes('/api/auth/reactivate')) reactivateCalls += 1;
    });
    await submitDeactivatedLogin(page);

    await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click();

    await expect(page.getByRole('dialog')).toBeHidden();
    await expect(page).toHaveURL('/login');
    await expect(page.locator('#login-email')).toHaveValue(mockDeactivatedEmail);
    expect(reactivateCalls).toBe(0);
  });

  test('a wrong password on re-activation keeps the dialog open with the error', async ({ page }) => {
    await submitDeactivatedLogin(page);
    // The login handler accepted the password; make the reactivate call reject it.
    await page.route('**/api/auth/reactivate', (route) =>
      route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({
          success: false,
          message: 'Invalid email or password',
          errorCode: 'INVALID_CREDENTIALS',
          data: null,
          timestamp: new Date().toISOString(),
        }),
      }),
    );

    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: 'Re-activate' }).click();

    await expect(dialog.getByRole('alert')).toHaveText('Invalid email or password.');
    await expect(page).toHaveURL('/login');
  });
});
