import { expect, test } from '../mocks/test.ts';
import { mockAccessToken, mockPassword, mockUser } from '../mocks/fixtures.ts';

// MSW-0's own acceptance criteria: prove the browser-mode worker actually
// intercepts before any consumer (AUTH-1/AUTH-8) exists to exercise it
// through real UI. Drives a raw fetch from the page context (there's no
// login form yet) and checks response.fromServiceWorker() — the one
// unambiguous signal Playwright exposes that a response never reached a
// real network socket.

test('MSW intercepts POST /api/auth/login and returns the fixture', async ({ page }) => {
  await page.goto('/');
  await page.evaluate('window.__mswReady');

  const responsePromise = page.waitForResponse('**/api/auth/login');
  const resultJson = (await page.evaluate(`
    fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: '${mockUser.email}', password: '${mockPassword}' }),
    }).then((r) => r.json())
  `)) as {
    success: boolean;
    data: { accessToken: string; tokenType: string; user: { email: string; roles: string[] } };
  };
  const response = await responsePromise;

  expect(response.fromServiceWorker()).toBe(true);
  expect(resultJson.success).toBe(true);
  expect(resultJson.data.accessToken).toBe(mockAccessToken);
  expect(resultJson.data.tokenType).toBe('Bearer');
  expect(resultJson.data.user.email).toBe(mockUser.email);
  expect(resultJson.data.user.roles).toEqual(mockUser.roles);
});

test('MSW returns 401 for wrong credentials', async ({ page }) => {
  await page.goto('/');
  await page.evaluate('window.__mswReady');

  const status = await page.evaluate(`
    fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: '${mockUser.email}', password: 'wrong-password' }),
    }).then((r) => r.status)
  `);

  expect(status).toBe(401);
});

test('MSW rejects /api/auth/refresh without a valid refresh cookie', async ({ page }) => {
  await page.goto('/');
  await page.evaluate('window.__mswReady');

  const status = await page.evaluate(`
    fetch('/api/auth/refresh', { method: 'POST' }).then((r) => r.status)
  `);

  expect(status).toBe(401);
});

test('MSW rejects /api/auth/logout without an Authorization header', async ({ page }) => {
  await page.goto('/');
  await page.evaluate('window.__mswReady');

  const status = await page.evaluate(`
    fetch('/api/auth/logout', { method: 'POST' }).then((r) => r.status)
  `);

  expect(status).toBe(401);
});
