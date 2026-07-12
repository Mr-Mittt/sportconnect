import { AxeBuilder } from '@axe-core/playwright';
import { seedAuthenticatedSession } from '../mocks/fixtures.ts';
import { expect, test } from '../mocks/test.ts';

/*
 * HF-8: accessibility + responsive gate for the Home Feed. Two invariants at
 * every supported breakpoint:
 *  1. no horizontal overflow (the page never scrolls sideways)
 *  2. axe reports zero critical/serious violations
 * Runs against the real app (same e2e project as the functional flows), so a
 * regressing token or layout change fails CI, not a manual audit.
 *
 * AUTH-4 update: Home Feed now sits behind ProtectedRoute, so every case
 * seeds an authenticated session (MSW-backed) before loading it.
 */

const breakpoints = [375, 768, 1280] as const;

async function loadHomeFeed(page: import('@playwright/test').Page, width: number) {
  await page.setViewportSize({ width, height: 900 });
  // Lands on / after login (SPA navigate, no reload) — no separate
  // page.goto('/') needed, and adding one would reintroduce AUTH-3's
  // bootstrap-vs-MSW-worker-ready race on a fresh navigation.
  await seedAuthenticatedSession(page);
  // Rail content present = page fully assembled
  await expect(page.getByRole('region', { name: 'Upcoming matches' })).toBeVisible();
}

async function gatingViolations(page: import('@playwright/test').Page) {
  const results = await new AxeBuilder({ page }).analyze();
  return results.violations
    .filter((v) => v.impact === 'critical' || v.impact === 'serious')
    .map((v) => `${v.impact} ${v.id} (${v.nodes.length} nodes): ${v.help}`);
}

for (const width of breakpoints) {
  test(`home feed @ ${width}px — no horizontal overflow`, async ({ page }) => {
    await loadHomeFeed(page, width);
    // String form on purpose: the e2e tsconfig has no DOM lib (same idiom as
    // the visual spec's 'document.fonts.ready')
    const overflow = await page.evaluate<number>(
      'document.scrollingElement.scrollWidth - document.scrollingElement.clientWidth',
    );
    expect(overflow, 'page must not scroll horizontally').toBeLessThanOrEqual(0);
  });

  test(`home feed @ ${width}px — axe reports no critical/serious violations`, async ({ page }) => {
    await loadHomeFeed(page, width);
    expect(await gatingViolations(page)).toEqual([]);
  });
}

test('sport-filtered state — axe reports no critical/serious violations', async ({ page }) => {
  await loadHomeFeed(page, 1280);
  await page.getByRole('button', { name: 'Basketball', exact: true }).click();
  // Filtered feed rendered (single basketball post from mock data)
  await expect(page.getByRole('article')).toHaveCount(1);
  expect(await gatingViolations(page)).toEqual([]);
});

/*
 * AUTH-6: same a11y gate extended to Login/Register — logged-out routes, not
 * behind ProtectedRoute, so no seedAuthenticatedSession() call. MSW's default
 * /auth/refresh handler 401s without a cookie (fixtures.ts), which is the
 * normal logged-out bootstrap outcome these pages render against anyway.
 */

const authPages = [
  { path: '/login', heading: 'Welcome back' },
  { path: '/register', heading: 'Create your account' },
] as const;

async function loadAuthPage(
  page: import('@playwright/test').Page,
  path: '/login' | '/register',
  heading: string,
  width: number,
) {
  await page.setViewportSize({ width, height: 900 });
  await page.goto(path);
  await page.evaluate('window.__mswReady');
  await expect(page.getByRole('heading', { name: heading })).toBeVisible();
}

for (const { path, heading } of authPages) {
  for (const width of breakpoints) {
    test(`${path} @ ${width}px — no horizontal overflow`, async ({ page }) => {
      await loadAuthPage(page, path, heading, width);
      const overflow = await page.evaluate<number>(
        'document.scrollingElement.scrollWidth - document.scrollingElement.clientWidth',
      );
      expect(overflow, 'page must not scroll horizontally').toBeLessThanOrEqual(0);
    });

    test(`${path} @ ${width}px — axe reports no critical/serious violations`, async ({ page }) => {
      await loadAuthPage(page, path, heading, width);
      expect(await gatingViolations(page)).toEqual([]);
    });
  }
}

// Full keyboard navigation: axe checks name/role/value and contrast, but not
// tab order — this walks Tab through every real control (skipping the
// disabled OAuth row, which native `disabled` already removes from tab
// order) and asserts the sequence explicitly, once per form.
test('/login: Tab reaches every control in order', async ({ page }) => {
  await page.goto('/login');
  await page.evaluate('window.__mswReady');
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();

  await page.keyboard.press('Tab');
  await expect(page.getByLabel('Email', { exact: true })).toBeFocused();

  await page.keyboard.press('Tab');
  // exact: true — getByLabel does substring matching by default, and
  // "Password" is a substring of the toggle button's aria-label "Show password".
  await expect(page.getByLabel('Password', { exact: true })).toBeFocused();

  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Show password' })).toBeFocused();

  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Log in' })).toBeFocused();

  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Create an account' })).toBeFocused();
});

test('/register: Tab reaches every control in order', async ({ page }) => {
  await page.goto('/register');
  await page.evaluate('window.__mswReady');
  await expect(page.getByRole('heading', { name: 'Create your account' })).toBeVisible();

  await page.keyboard.press('Tab');
  await expect(page.getByLabel('Email', { exact: true })).toBeFocused();

  await page.keyboard.press('Tab');
  // exact: true — getByLabel does substring matching by default, and
  // "Password" is a substring of the toggle button's aria-label "Show password".
  await expect(page.getByLabel('Password', { exact: true })).toBeFocused();

  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Show password' })).toBeFocused();

  await page.keyboard.press('Tab');
  await expect(page.getByLabel('Full name')).toBeFocused();

  await page.keyboard.press('Tab');
  await expect(page.getByLabel('Phone number (optional)')).toBeFocused();

  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Create account' })).toBeFocused();

  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Log in' })).toBeFocused();
});
