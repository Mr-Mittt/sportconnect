import { mockPassword, mockUser } from '../mocks/fixtures.ts';
import { expect, test } from '../mocks/test.ts';

/*
 * AUTH-8: the auth journey (AUTH/FEED epic § AUTH-8). Auto-waiting
 * assertions only; no sleeps, per the epic's acceptance criteria.
 *
 * Originally two things differed from the epic's literal spec, both tracing
 * to the same root cause: MSW's old Service Worker setup re-triggered on
 * every real navigation and could lose a race against the app's own
 * bootstrap fetch (`useSessionBootstrap`) — see `client/docs/BACKLOG_MVP.md`
 * · **MSW-1** for the full investigation. **MSW-1 has since landed**: the
 * mock server is a real, already-running process with no per-navigation
 * setup handshake, so that race no longer exists.
 *
 * 1. **Still split into shorter tests** (register/logout/login, the restored
 *    reload-persistence step, and expired session/deep link) rather than one
 *    continuous 7-step journey — kept this way since it's a harmless,
 *    already-working organization, not because it's still working around
 *    anything.
 * 2. **Step 6 still doesn't reload.** MSW-1 fixes the setup-handshake race,
 *    not the separate stuck-state issue an earlier reload-based version of
 *    step 6 hit even under normal, non-repeated runs (see the step's own
 *    comment) — simulating the expired session via AUTH-5's 401-retry
 *    interceptor remains the reliable approach for that specific scenario.
 * 3. **Step 5 (reload while logged in — still authenticated) is back.** A
 *    real `Set-Cookie` response from the mock server is now genuinely
 *    honored by the browser's own cookie jar (unlike the old
 *    Service-Worker-synthesized response, or a Playwright
 *    `route.fulfill()`-mocked one — see AUTH-8's original investigation),
 *    so a reload-persistence assertion is finally meaningful, not just
 *    finally race-free. Verified flake-free via a repeated local run
 *    (`--repeat-each=10`) — see MSW-1's summary doc for the results.
 *
 * Step numbers below keep the epic's original numbering, including gaps
 * where a step lives in a different test than its neighbors, so this file
 * stays traceable against the epic spec.
 */

test('Auth journey — register, logout, login', async ({ page }) => {
  await test.step('1. register with valid details — lands authenticated (AUTH-2: auto-login)', async () => {
    await page.goto('/register');
    await page.getByLabel('Email', { exact: true }).fill('new-player@example.com');
    await page.getByLabel('Password', { exact: true }).fill(mockPassword);
    await page.getByLabel('Full name').fill('New Player');
    await page.getByRole('button', { name: 'Create account' }).click();

    await page.waitForURL('/');
    await expect(page.getByRole('heading', { name: 'Home Feed' })).toBeVisible();
  });

  await test.step('2. log out — redirected to /login, protected routes now redirect there too', async () => {
    await page.getByRole('button', { name: 'Your account' }).click();
    await page.getByRole('menuitem', { name: 'Log out' }).click();

    await page.waitForURL('/login');
    await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();

    await page.goto('/friends');
    await page.waitForURL('/login');

    // Reset to a plain /login with no carried-over redirect-back target, so
    // step 3's login lands on '/' — the redirect-back behavior itself is
    // what step 7 verifies (in the other test), deliberately kept separate
    // from step 3's assertion. Bouncing through about:blank first
    // guarantees a genuinely fresh navigation — goto() to the URL the page
    // is already on can be a same-document no-op that keeps the prior
    // Navigate's history state.
    await page.goto('about:blank');
    await page.goto('/login');
  });

  await test.step('3. log in with valid credentials — lands back in the app', async () => {
    await page.getByLabel('Email', { exact: true }).fill(mockUser.email);
    await page.getByLabel('Password', { exact: true }).fill(mockPassword);
    await page.getByRole('button', { name: 'Log in' }).click();

    await page.waitForURL('/');
    await expect(page.getByRole('heading', { name: 'Home Feed' })).toBeVisible();
  });

  await test.step('4. log in with invalid credentials — inline error, stays on /login', async () => {
    await page.getByRole('button', { name: 'Your account' }).click();
    await page.getByRole('menuitem', { name: 'Log out' }).click();
    await page.waitForURL('/login');

    await page.getByLabel('Email', { exact: true }).fill(mockUser.email);
    await page.getByLabel('Password', { exact: true }).fill('definitely-wrong-password');
    await page.getByRole('button', { name: 'Log in' }).click();

    await expect(page.getByRole('alert')).toHaveText('Invalid email or password');
    await expect(page).toHaveURL('/login');
  });
});

test('Auth journey — reload while logged in stays authenticated', async ({ page }) => {
  await test.step('5. reload while logged in — still authenticated', async () => {
    // MSW-1: this step could not be implemented before — see the file-level
    // comment. A dedicated test (own fresh session) rather than continuing
    // from test 1's steps, since Playwright already gives every test its
    // own isolated context/session (test.ts's mockSessionId) — no reuse
    // benefit from chaining it onto steps 1-4, and keeping it isolated means
    // a failure here can't be masked by (or itself mask) the register/logout
    // journey's own assertions.
    await page.goto('/login');
    await page.getByLabel('Email', { exact: true }).fill(mockUser.email);
    await page.getByLabel('Password', { exact: true }).fill(mockPassword);
    await page.getByRole('button', { name: 'Log in' }).click();
    await page.waitForURL('/');
    await expect(page.getByRole('heading', { name: 'Home Feed' })).toBeVisible();

    await page.reload();

    // Still authenticated: no redirect to /login, Home Feed renders again
    // straight from the reload (AUTH-3's useSessionBootstrap refreshing
    // successfully against the real, browser-held refresh-token cookie).
    await expect(page.getByRole('heading', { name: 'Home Feed' })).toBeVisible();
    await expect(page).toHaveURL('/');
  });
});

test('Auth journey — expired session, then protected deep link', async ({ page }) => {
  await test.step('6. simulated expired session — redirected to /login, session cleared', async () => {
    // Deliberately not reload-based (see the file-level comment for why a
    // reload-triggered version of this step was unreliable even under
    // normal, non-repeated suite runs). Instead: stay on the one, already-
    // stable page load from login, and simulate "the refresh token was
    // revoked server-side sometime after login" via the *next* authenticated
    // action failing — logout, forced to 401 once via page.route() (the
    // same reliable technique AUTH-5's own real-backend verification used).
    // AUTH-5's interceptor catches that 401 and attempts a silent refresh,
    // which fails too (no valid session cookie exists in this test either
    // way), and useLogout's onSettled clears the session regardless of the
    // network outcome — so this reaches the epic's exact target state
    // (refresh handler failure → redirected to /login, session cleared)
    // without ever needing a second real navigation to race MSW's setup
    // against.
    await page.goto('/login');
    await page.getByLabel('Email', { exact: true }).fill(mockUser.email);
    await page.getByLabel('Password', { exact: true }).fill(mockPassword);
    await page.getByRole('button', { name: 'Log in' }).click();
    await page.waitForURL('/');

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

    await page.waitForURL('/login');
    await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();

    // Session genuinely cleared, not just a stale render: a protected route
    // redirects again rather than showing cached content.
    await page.goto('/');
    await page.waitForURL('/login');
  });

  await test.step('7. deep link to a protected URL while logged out — redirected, then returned after login', async () => {
    await page.goto('/friends');
    await page.waitForURL('/login');

    await page.getByLabel('Email', { exact: true }).fill(mockUser.email);
    await page.getByLabel('Password', { exact: true }).fill(mockPassword);
    await page.getByRole('button', { name: 'Log in' }).click();

    await page.waitForURL('/friends');
    await expect(page.getByRole('heading', { name: 'Friends' })).toBeVisible();
  });
});
