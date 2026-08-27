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
  // page.goto('/') needed.
  await seedAuthenticatedSession(page);
  // Rail content present = page fully assembled. Feed is real now (FEED-1) —
  // also wait for it to actually finish loading, so the overflow/axe checks
  // below exercise the fully-loaded page consistently rather than racing
  // Feed's (null-rendering) loading state.
  await expect(page.getByRole('region', { name: 'Upcoming matches' })).toBeVisible();
  await expect(page.getByRole('article').first()).toBeVisible();
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
  await page.getByRole('button', { name: 'Pickleball', exact: true }).click();
  // Filtered feed rendered (single pickleball post — FEED-1's real feed,
  // e2e/mocks/handlers/feed.ts's mockBasketballPost fixture)
  await expect(page.getByRole('article')).toHaveCount(1);
  expect(await gatingViolations(page)).toEqual([]);
});

/*
 * GRP-3: baseline axe coverage for the Groups page — GRP-1/GRP-2 both
 * claimed to extend this file in their own acceptance criteria but neither
 * actually added a Groups-page block, so this establishes it rather than
 * silently carrying the gap forward again. One check at 1280px, owner role,
 * Members tab (the richest of the per-group tabs — 5 sections, role-gated
 * content, action buttons) — not a full breakpoint/tab matrix backfill for
 * Posts/Chat/Settings, which is out of proportion for this ticket.
 */
test('groups page — Members tab (owner) — axe reports no critical/serious violations', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await seedAuthenticatedSession(page, '/groups');
  await page.getByRole('group', { name: 'Group filter' }).getByRole('button', { name: /Weekend Tennis Ladder/ }).click();
  await page.getByRole('tab', { name: 'Members' }).click();
  await expect(page.getByRole('region', { name: 'Group administrator' })).toBeVisible();
  expect(await gatingViolations(page)).toEqual([]);
});

/*
 * FRIEND-1: baseline axe coverage for the Friends page. One check at 1280px
 * with a friend selected (the richest state — rail + profile/chat split,
 * same "one representative state, not a full breakpoint/tab matrix" scoping
 * the Groups-page check above used).
 */
test('friends page — friend selected — axe reports no critical/serious violations', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await seedAuthenticatedSession(page, '/friends');
  await page.getByRole('region', { name: 'Offline' }).getByText('Priya Shah').click();
  await expect(page.getByLabel('Message')).toBeVisible();
  expect(await gatingViolations(page)).toEqual([]);
});

/*
 * PROFILE-7: responsive + a11y gate for the `/profile` page. Unlike GRP-3/
 * FRIEND-1 (axe-only, one representative state), this page's own ticket text
 * explicitly calls for a responsive check at all 3 breakpoints too — same
 * HF-8 shape (overflow + axe per breakpoint) for the default (Posts) state,
 * plus one representative axe check each for the two richer states the
 * ticket names (Settings tab's editor, Edit Profile modal), matching GRP-3/
 * FRIEND-1's "one state, not a full matrix" scoping for those.
 */
async function loadProfilePage(page: import('@playwright/test').Page, width: number) {
  await page.setViewportSize({ width, height: 900 });
  await seedAuthenticatedSession(page, '/profile');
  await expect(page.getByRole('tab', { name: 'Posts', selected: true })).toBeVisible();
  await expect(page.getByRole('article').first()).toBeVisible();
}

for (const width of breakpoints) {
  test(`profile page @ ${width}px — no horizontal overflow`, async ({ page }) => {
    await loadProfilePage(page, width);
    const overflow = await page.evaluate<number>(
      'document.scrollingElement.scrollWidth - document.scrollingElement.clientWidth',
    );
    expect(overflow, 'page must not scroll horizontally').toBeLessThanOrEqual(0);
  });

  test(`profile page @ ${width}px — axe reports no critical/serious violations`, async ({ page }) => {
    await loadProfilePage(page, width);
    expect(await gatingViolations(page)).toEqual([]);
  });
}

test('profile page — Settings tab — axe reports no critical/serious violations', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await seedAuthenticatedSession(page, '/profile');
  await page.getByRole('tab', { name: 'Settings' }).click();
  await expect(page.getByLabel('Skill level')).toBeVisible();
  expect(await gatingViolations(page)).toEqual([]);
});

test('profile page — Edit Profile modal open — axe reports no critical/serious violations', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await seedAuthenticatedSession(page, '/profile');
  await page.getByRole('button', { name: 'Edit profile' }).click();
  await expect(page.getByRole('dialog', { name: 'Edit profile' })).toBeVisible();
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
