import type { Page } from '@playwright/test';
import type { User } from '../../src/features/auth/types.ts';

// Reused across AUTH-8 and FEED-10 rather than each test inventing its own
// ad-hoc response shapes (per MSW-0's acceptance criteria).
export const mockUser: User = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'jordan@example.com',
  firstName: 'Jordan',
  lastName: 'Lee',
  username: 'jordanlee',
  phoneNumber: null,
  avatarUrl: null,
  roles: ['USER'],
};

export const mockPassword = 'password123';
export const mockAccessToken = 'mock-access-token';

// A distinct refresh-token string used only to simulate the httpOnly cookie
// round-trip (set on login/register/refresh, checked on refresh/logout).
// Real tests never read this directly — the browser handles the cookie.
export const mockRefreshToken = 'mock-refresh-token';

/**
 * Gets a spec's page into an authenticated state on `targetPath` (default
 * `/`), before that route (behind ProtectedRoute, AUTH-4) is asserted on.
 * AUTH-3's useSessionBootstrap fires POST /auth/refresh on every app mount,
 * so any protected route needs a valid session established first.
 *
 * Deliberately drives the real LoginForm rather than a raw `fetch()` or
 * `context.addCookies()`. Two things ruled those out:
 *  - `context.addCookies()` is invisible to MSW: its browser-mode `cookies`
 *    resolver arg doesn't read the real browser cookie jar, only its own
 *    private, localStorage-backed shadow store (`msw/lib/core/utils/
 *    cookieStore.mjs`), populated exclusively by Set-Cookie headers passing
 *    through MSW's own mocked responses (confirmed empirically).
 *  - A raw `fetch('/api/auth/login')` populates that store correctly, but a
 *    *subsequent* `page.goto()` still races AUTH-3's automatic bootstrap
 *    effect against MSW's per-navigation worker-ready handshake
 *    (`addInitScript` re-runs `worker.start()` on every navigation) — flaky
 *    under parallel workers (confirmed empirically: reliable alone, ~80%
 *    failure rate run in parallel).
 *
 * Instead: go to `targetPath` directly while logged out. ProtectedRoute
 * redirects to /login carrying `targetPath` as the redirect-back target —
 * this works deterministically regardless of whether THIS FIRST
 * navigation's own (expected-to-fail) bootstrap call actually got
 * intercepted by MSW or fell through entirely, since both outcomes are
 * "not logged in" and get handled identically. Then log in through the UI:
 * `useLogin`'s `onSuccess` calls `authStore.setSession()` directly in
 * memory and navigates back to `targetPath` via React Router's `navigate()`
 * — an in-app transition, not a reload, so there's no second bootstrap
 * fetch and no second race on the way back.
 *
 * Must be called with a page from the MSW-wired `test` in `test.ts`.
 */
export async function seedAuthenticatedSession(page: Page, targetPath = '/'): Promise<void> {
  await page.goto(targetPath);
  await page.waitForURL(/\/login/, { timeout: 10000 });
  await page.evaluate('window.__mswReady');
  await page.getByLabel('Email', { exact: true }).fill(mockUser.email);
  await page.getByLabel('Password', { exact: true }).fill(mockPassword);
  await page.getByRole('button', { name: 'Log in' }).click();
  await page.waitForURL(
    (url) => url.pathname + url.search === targetPath || (targetPath === '/' && url.pathname === '/'),
    { timeout: 10000 },
  );
}
