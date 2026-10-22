import { KEYCLOAK_AUTH_URL, signIn } from '../mocks/keycloakStub.ts';
import { mockReactivationTicket } from '../mocks/fixtures.ts';
import { expect, test } from '../mocks/test.ts';

/*
 * AUTH-10, reworked by AUTH-14: a password user whose account is deactivated is answered
 * `401 ACCOUNT_DEACTIVATED` with a one-time ticket by `POST /api/auth/callback` (backend A26). The
 * auth handler (e2e/mocks/handlers/auth.ts) does that for `deactivated-code`; `/auth/reactivate`
 * accepts the known ticket and `/auth/reactivate/cancel` always answers 200. There is no password in
 * the dialog any more — the ticket is the proof.
 */

test.describe('re-activate a deactivated account after sign-in', () => {
  test('confirm sends the ticket and lands in the app', async ({ page }) => {
    await signIn(page, 'deactivated');

    const dialog = page.getByRole('dialog', { name: 'Re-activate your account?' });
    await expect(dialog).toBeVisible();

    const reactivateRequest = page.waitForRequest('**/api/auth/reactivate');
    await dialog.getByRole('button', { name: 'Re-activate' }).click();

    expect((await reactivateRequest).postDataJSON()).toEqual({ ticket: mockReactivationTicket });
    await page.waitForURL('/');
    await expect(page.getByRole('heading', { name: 'Home Feed' })).toBeVisible();
  });

  test('decline sends the ticket to cancel and goes back to sign-in without a session', async ({ page }) => {
    let reactivateCalls = 0;
    page.on('request', (request) => {
      if (request.url().endsWith('/api/auth/reactivate')) reactivateCalls += 1;
    });
    await signIn(page, 'deactivated');

    const cancelRequest = page.waitForRequest('**/api/auth/reactivate/cancel');
    await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click();

    expect((await cancelRequest).postDataJSON()).toEqual({ ticket: mockReactivationTicket });
    await page.waitForURL(KEYCLOAK_AUTH_URL);
    expect(reactivateCalls).toBe(0);
  });

  test('an expired ticket keeps the dialog open with the localized line', async ({ page }) => {
    await signIn(page, 'deactivated');
    await page.route('**/api/auth/reactivate', (route) =>
      route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({
          success: false,
          message: 'Invalid reactivation ticket',
          errorCode: 'REACTIVATION_TICKET_INVALID',
          data: null,
          timestamp: new Date().toISOString(),
        }),
      }),
    );

    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: 'Re-activate' }).click();

    await expect(dialog.getByRole('alert')).toHaveText(
      'This re-activation request expired. Sign in again to continue.',
    );
    await expect(page).toHaveURL(/\/auth\/callback/);
  });
});
