import { KEYCLOAK_AUTH_URL, signIn } from '../mocks/keycloakStub.ts';
import { expect, test } from '../mocks/test.ts';

/*
 * CLIENT-ERR-2, reworked by AUTH-14: the sign-in's server errors, localized from the error code, end
 * to end. The only place a sign-in can fail inside this app is `/auth/callback` (the credentials are
 * entered on Keycloak's hosted page, AUTH-15's surface), so that is what is covered: the auth handler
 * (e2e/mocks/handlers/auth.ts) answers 401 AUTH_CODE_INVALID for a code it does not know; the page
 * also refuses a mismatching `state` and a Keycloak `error` parameter without calling the backend.
 */

async function useVietnamese(page: import('@playwright/test').Page) {
  await page.addInitScript(() => {
    localStorage.setItem('locale-storage', JSON.stringify({ state: { locale: 'vi' }, version: 0 }));
  });
}

test.describe('callback errors', () => {
  test('an unknown code shows the localized line and a Try again that restarts the sign-in', async ({ page }) => {
    await signIn(page, { code: 'not-a-code' }, { stayOnCallback: true });

    await expect(page.getByRole('heading', { name: 'We couldn’t sign you in' })).toBeVisible();
    await expect(page.getByRole('alert')).toContainText('Your sign-in link expired or was already used.');
    await expect(page).toHaveURL(/\/auth\/callback/);

    await page.getByRole('button', { name: 'Try again' }).click();
    await page.waitForURL(KEYCLOAK_AUTH_URL);
  });

  test('the same error in vi', async ({ page }) => {
    await useVietnamese(page);
    await signIn(page, { code: 'not-a-code' }, { stayOnCallback: true });

    await expect(page.getByRole('heading', { name: 'Không thể đăng nhập' })).toBeVisible();
    await expect(page.getByRole('alert')).toContainText('Liên kết đăng nhập đã hết hạn hoặc đã được dùng.');
  });

  test('a backend outage (503) shows the sign-in service line', async ({ page }) => {
    await page.route('**/api/auth/callback', (route) =>
      route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({
          success: false,
          message: 'Service unavailable',
          errorCode: 'SERVICE_UNAVAILABLE',
          data: null,
          timestamp: new Date().toISOString(),
        }),
      }),
    );
    await signIn(page, 'user', { stayOnCallback: true });

    await expect(page.getByRole('alert')).toContainText('The sign-in service isn’t reachable right now.');
  });

  test('a state that does not match, or a Keycloak error, is refused without calling the backend', async ({ page }) => {
    let calls = 0;
    page.on('request', (request) => {
      if (request.url().includes('/api/auth/callback')) calls += 1;
    });

    await page.goto('/auth/callback?code=user-code&state=forged');
    await expect(page.getByRole('alert')).toContainText('Your sign-in link expired or was already used.');

    await page.goto('/auth/callback?error=access_denied');
    await expect(page.getByRole('alert')).toBeVisible();
    expect(calls).toBe(0);
  });
});
