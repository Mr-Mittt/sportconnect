import { expect, test } from '../mocks/test.ts';
import { mockAccessToken, mockPassword, mockUser } from '../mocks/fixtures.ts';
import { MOCK_SERVER_URL } from '../mocks/mockServerConfig.ts';

// Proves the standalone mock server (MSW-1) actually handles requests,
// before any consumer (AUTH-1/AUTH-8) exists to exercise it through real UI.
// Drives a raw fetch from the page context (there's no login form yet) and
// checks the mock server's own request log
// (`/__mock/sessions/:id/requests`) — the server-side replacement for the
// old `response.fromServiceWorker()` check. That check stopped being
// meaningful once mocking moved out of the browser: there's no "did this
// reach a Service Worker" question left to ask (Vite's dev proxy sends
// `/api/**` straight to the mock server during e2e runs, nothing else is
// listening there to have "leaked" to) — the question now is "did the mock
// server's own handler actually run for this request."
//
// MSW-1: no more `page.evaluate('window.__mswReady')` before interacting —
// the mock server is already listening before the test starts, so there's
// no per-navigation setup handshake left to wait for.

test('MSW intercepts POST /api/auth/login and returns the fixture', async ({ page, mockSessionId }) => {
  await page.goto('/');

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

  const log = (await (
    await fetch(`${MOCK_SERVER_URL}/__mock/sessions/${encodeURIComponent(mockSessionId)}/requests`)
  ).json()) as Array<{ method: string; path: string }>;
  expect(log).toContainEqual(expect.objectContaining({ method: 'POST', path: '/api/auth/login' }));

  expect(resultJson.success).toBe(true);
  expect(resultJson.data.accessToken).toBe(mockAccessToken);
  expect(resultJson.data.tokenType).toBe('Bearer');
  expect(resultJson.data.user.email).toBe(mockUser.email);
  expect(resultJson.data.user.roles).toEqual(mockUser.roles);
});

test('MSW returns 401 for wrong credentials', async ({ page }) => {
  await page.goto('/');

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

  const status = await page.evaluate(`
    fetch('/api/auth/refresh', { method: 'POST' }).then((r) => r.status)
  `);

  expect(status).toBe(401);
});

test('MSW rejects /api/auth/logout without an Authorization header', async ({ page }) => {
  await page.goto('/');

  const status = await page.evaluate(`
    fetch('/api/auth/logout', { method: 'POST' }).then((r) => r.status)
  `);

  expect(status).toBe(401);
});
