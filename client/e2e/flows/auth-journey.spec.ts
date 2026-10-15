import { KEYCLOAK_AUTH_URL, keycloakCode, keycloakRedirectBack, signIn } from '../mocks/keycloakStub.ts';
import { expect, test } from '../mocks/test.ts';

/*
 * AUTH-8, reworked by AUTH-14: the auth journey. Since AUTH-14, `/login` and `/register` are no
 * longer forms — they redirect to Keycloak's hosted pages and come back through `/auth/callback`.
 * MSW cannot play a browser redirect, so mocks/keycloakStub.ts stands in for Keycloak at the browser
 * level (the real client code still builds the PKCE request, navigates and finishes the exchange
 * against the MSW `/api/auth/callback` handler). The redirect against a real Keycloak is AUTH-15.
 *
 * Auto-waiting assertions only; no sleeps. Step numbers keep the epic's original numbering where a
 * step survived, so the file stays traceable against the epic spec.
 */

const KEYCLOAK_PAGE = /\/realms\/sportconnect\/protocol\/openid-connect\/auth\?/;

test('Auth journey — sign in, log out, sign in again', async ({ page }) => {
  await test.step('3. sign in — the redirect flow lands back in the app', async () => {
    await signIn(page);

    await expect(page).toHaveURL('/');
    await expect(page.getByRole('heading', { name: 'Home Feed' })).toBeVisible();
  });

  await test.step('2. log out — sent to Keycloak, protected routes now redirect there too', async () => {
    await page.getByRole('button', { name: 'Your account' }).click();
    await page.getByRole('menuitem', { name: 'Log out' }).click();

    await page.waitForURL(KEYCLOAK_PAGE);
    await expect(page.getByRole('heading', { name: 'Keycloak sign-in' })).toBeVisible();

    await page.goto('/friends');
    await page.waitForURL(KEYCLOAK_PAGE);
  });

  await test.step('3b. sign in again', async () => {
    await signIn(page);

    await expect(page).toHaveURL('/');
    await expect(page.getByRole('heading', { name: 'Home Feed' })).toBeVisible();
  });
});

test('Auth journey — /register asks Keycloak for the create-account step', async ({ page }) => {
  let requestedUrl = '';
  const handler = keycloakRedirectBack(keycloakCode.user);
  await page.route(KEYCLOAK_AUTH_URL, (route) => {
    requestedUrl = route.request().url();
    return handler(route);
  });

  await page.goto('/register');
  await page.waitForURL('/');

  const params = new URL(requestedUrl).searchParams;
  expect(params.get('prompt')).toBe('create');
  expect(params.get('code_challenge_method')).toBe('S256');
  expect(params.get('client_id')).toBe('sportconnect-web');
  expect(params.get('redirect_uri')).toBe(`${new URL(page.url()).origin}/auth/callback`);
  await expect(page.getByRole('heading', { name: 'Home Feed' })).toBeVisible();
});

test('Auth journey — reload while logged in stays authenticated', async ({ page }) => {
  await test.step('5. reload while logged in — still authenticated', async () => {
    // MSW-1: a real `Set-Cookie` response from the mock server is genuinely honored by the browser's
    // own cookie jar, so the reload-persistence assertion is meaningful (AUTH-3's useSessionBootstrap
    // refreshing against the browser-held refresh-token cookie).
    await signIn(page);
    await expect(page.getByRole('heading', { name: 'Home Feed' })).toBeVisible();

    await page.reload();

    await expect(page.getByRole('heading', { name: 'Home Feed' })).toBeVisible();
    await expect(page).toHaveURL('/');
  });
});

test('Auth journey — expired session, then protected deep link', async ({ page }) => {
  await test.step('6. simulated expired session — sent to sign-in, session cleared', async () => {
    // Deliberately not reload-based (see AUTH-8's original investigation). Stay on the one stable page
    // load from sign-in and simulate "the refresh token was revoked server-side sometime after login"
    // via the *next* authenticated action failing — logout, forced to 401 once via page.route(). Since
    // A26 logout answers from the cookie and any outcome other than a 503 signs the user out locally.
    await signIn(page);

    let intercepted = false;
    await page.route('**/api/auth/logout', async (route) => {
      if (!intercepted) {
        intercepted = true;
        await route.fulfill({
          status: 401,
          contentType: 'application/json',
          body: JSON.stringify({ success: false, message: 'Unauthorized', data: null, timestamp: new Date().toISOString() }),
        });
      } else {
        await route.continue();
      }
    });

    await page.getByRole('button', { name: 'Your account' }).click();
    await page.getByRole('menuitem', { name: 'Log out' }).click();

    await page.waitForURL(KEYCLOAK_PAGE);

    // Session genuinely cleared, not just a stale render: a protected route redirects again rather than
    // showing cached content.
    await page.goto('/');
    await page.waitForURL(KEYCLOAK_PAGE);
  });

  await test.step('7. deep link to a protected URL while logged out — redirected, then returned after sign-in', async () => {
    await signIn(page, 'user', { path: '/friends' });

    await expect(page).toHaveURL('/friends');
    await expect(page.getByRole('heading', { name: 'Friends' })).toBeVisible();
  });
});
