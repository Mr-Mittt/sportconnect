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
 *  - `context.addCookies({ httpOnly: true, ... })` is invisible to MSW's
 *    `cookies` resolver arg (confirmed empirically). **Correction (AUTH-8):**
 *    the original note here attributed this to a localStorage-backed shadow
 *    store, which is inaccurate — `msw/lib/browser/` never references that
 *    module (grepped the installed package). The real behavior, re-verified
 *    for AUTH-8 with four targeted tests: within a single page's lifetime,
 *    login → refresh genuinely works (some in-page state does track the
 *    cookie correctly — a raw `fetch('/api/auth/login')` followed
 *    immediately by `fetch('/api/auth/refresh')`, no navigation in between,
 *    returns 200). But nothing survives an actual reload or fresh
 *    navigation: a `Set-Cookie` response header is never applied to the real
 *    browser cookie jar for a Service-Worker-mocked (or Playwright
 *    `route.fulfill()`-mocked) response at all, httpOnly or not, and
 *    `document.cookie` — which IS what `cookies` reads, not a shadow store —
 *    is consequently never populated either. MSW-0's doc claim that
 *    Set-Cookie "is processed by the browser exactly as if a real server had
 *    sent it" is wrong specifically for the across-reload case. See
 *    `seedRefreshCookieMirror` below for the one mechanism that does survive
 *    a reload, needed only when a spec must actually test that (this
 *    function doesn't need to — see next bullet).
 *  - A raw `fetch('/api/auth/login')` does work within the same page (see
 *    above), but a *subsequent* `page.goto()` still races AUTH-3's automatic
 *    bootstrap effect against MSW's per-navigation worker-ready handshake
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

/**
 * Seeds a JS-readable mirror of the refresh-token cookie so MSW's
 * `cookies` resolver arg (which reads `document.cookie` — see
 * seedAuthenticatedSession's corrected note above) can see it across a
 * `page.reload()`. This is the one mechanism that actually survives a
 * reload, because it's a genuine Playwright-managed browser cookie (not a
 * Set-Cookie response header, which is never honored for a mocked response
 * regardless of this flag).
 *
 * `httpOnly: false` is a deliberate test-only compromise: production code
 * never reads `document.cookie` either way (AUTH-0's own test asserts no
 * storage API is touched), so this doesn't weaken what's actually being
 * verified about the real httpOnly cookie contract — it only gives MSW's
 * mock visibility into what a real browser's actual (JS-invisible) cookie
 * jar would already hold at this point in a real session.
 *
 * Call after an authenticated session is established (e.g. after
 * seedAuthenticatedSession), before any navigation that needs the session to
 * survive.
 *
 * **Not currently exercised by any spec (AUTH-8).** A reload-persistence
 * test needs this cookie *and* a way to guarantee MSW's Service Worker
 * setup wins its race against the app's own bootstrap fetch on that same
 * reload — the second part isn't solved yet (see
 * `client/docs/BACKLOG_MVP.md` · **MSW-1**, filed to replace the
 * per-navigation Service Worker setup with a standalone mock server, which
 * would make this cookie unnecessary in the first place — a real server can
 * set real cookies a reload genuinely persists). This function is correct
 * and kept for when that lands, or for any other spec that needs a
 * reload-surviving session.
 */
export async function seedRefreshCookieMirror(page: Page): Promise<void> {
  await page.context().addCookies([
    {
      name: 'refreshToken',
      value: mockRefreshToken,
      domain: 'localhost',
      path: '/api/auth',
      httpOnly: false,
    },
  ]);
}

/**
 * Registers a second init script (runs after test.ts's own, per Playwright's
 * addInitScript registration-order guarantee) that re-applies a "refresh
 * token expired" override to the MSW worker on the *next* navigation.
 *
 * A one-off `worker.use()` call made directly from the Node-side test
 * wouldn't survive a `page.reload()` — the worker instance itself is
 * recreated fresh on every navigation (see test.ts's own addInitScript
 * comment), so the override has to be re-applied via another init script
 * chained onto the same `window.__mswReady` promise, not a one-time runtime
 * call (AUTH-8).
 *
 * Call this, then trigger any navigation, to simulate a session that was
 * valid until this point and then expired/was revoked server-side.
 *
 * **Not currently exercised by any spec (AUTH-8).** A reload-triggered
 * version of AUTH-8's step 6 used this and turned out unreliable even in
 * normal, non-repeated suite runs — not just the per-navigation MSW-vs-app
 * race every reload risks (see `client/docs/BACKLOG_MVP.md` · **MSW-1**),
 * but a harder stuck state past that. AUTH-8's step 6 was rewritten to
 * simulate the same scenario via AUTH-5's 401-retry interceptor instead
 * (no reload needed at all — see `auth-journey.spec.ts`), which is what
 * ships today. This function is correct and kept for when MSW-1 lands and
 * a reload-based version becomes reliable.
 */
export async function simulateExpiredSessionOnNextLoad(page: Page): Promise<void> {
  await page.addInitScript(
    "window.__mswReady.then(() => import('/e2e/mocks/expireSession.ts')" +
      '.then(({ overrideRefreshToExpired }) => overrideRefreshToExpired(window.__mswWorker)));',
  );
}
