import { KEYCLOAK_AUTH_URL, signIn } from '../mocks/keycloakStub.ts';
import { expect, test } from '../mocks/test.ts';

/*
 * AUTH-14: when Keycloak cannot be reached, `POST /api/auth/logout` answers 503 and the backend keeps
 * the refresh cookie — so the user is still signed in, and the app says so instead of pretending the
 * sign-out worked: a dialog with "Try again" and "Stay signed in". The 503 is simulated per test with
 * `page.route` (a browser-visible failure, not mock-server state).
 */

async function failLogoutOnce(page: import('@playwright/test').Page) {
  let failed = false;
  await page.route('**/api/auth/logout', (route) => {
    if (failed) return route.fallback();
    failed = true;
    return route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({
        success: false,
        message: 'Service unavailable',
        errorCode: 'SERVICE_UNAVAILABLE',
        data: null,
        timestamp: new Date().toISOString(),
      }),
    });
  });
}

async function openLogout(page: import('@playwright/test').Page) {
  await page.getByRole('button', { name: 'Your account' }).click();
  await page.getByRole('menuitem', { name: 'Log out' }).click();
}

test('a 503 on logout keeps the user signed in; "Stay signed in" closes the dialog', async ({ page }) => {
  await signIn(page);
  await failLogoutOnce(page);

  await openLogout(page);

  const dialog = page.getByRole('dialog', { name: 'Couldn’t sign you out' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Stay signed in' }).click();

  await expect(dialog).toBeHidden();
  await expect(page).toHaveURL('/');
  await expect(page.getByRole('heading', { name: 'Home Feed' })).toBeVisible();

  // Still signed in after a reload: the refresh cookie was kept, as the dialog says.
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Home Feed' })).toBeVisible();
});

test('"Try again" repeats the logout and, once it works, signs out', async ({ page }) => {
  await signIn(page);
  await failLogoutOnce(page);

  await openLogout(page);
  const dialog = page.getByRole('dialog', { name: 'Couldn’t sign you out' });
  await dialog.getByRole('button', { name: 'Try again' }).click();

  await page.waitForURL(KEYCLOAK_AUTH_URL);
  await expect(page.getByRole('heading', { name: 'Keycloak sign-in' })).toBeVisible();
});

test('the dialog copy is localized', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('locale-storage', JSON.stringify({ state: { locale: 'vi' }, version: 0 }));
  });
  await signIn(page);
  await failLogoutOnce(page);

  await page.getByRole('button', { name: 'Tài khoản của bạn' }).click();
  await page.getByRole('menuitem', { name: 'Đăng xuất' }).click();

  const dialog = page.getByRole('dialog', { name: 'Không thể đăng xuất' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Giữ đăng nhập' })).toBeVisible();
});
