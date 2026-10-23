import { AxeBuilder } from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { themeStoryIds, themeStoryName, themeStoryUrl } from '../mocks/themeStorybook.ts';

/*
 * AUTH-15: the accessibility and responsive gate for the Keycloak-hosted pages, replacing the
 * /login, /register, /forgot-password and /reset-password rows AUTH-14 removed from a11y.spec.ts.
 * Runs against the static theme Storybook (`pnpm build-theme-storybook` first), in its own
 * Playwright project (`pnpm test:theme`) so the routine `pnpm e2e` never needs that build.
 *
 * Per story, at every supported breakpoint: no horizontal overflow, and axe reports zero
 * critical/serious violations. Every story is also scanned in Vietnamese at 375px (the longest
 * strings, the narrowest card). Login and Register additionally get a Tab-order check.
 */

const breakpoints = [375, 768, 1280] as const;
const stories = themeStoryIds().map((id) => ({ id, name: themeStoryName(id) }));

async function open(page: import('@playwright/test').Page, id: string, locale: 'en' | 'vi') {
  await page.goto(themeStoryUrl(id, locale));
  await expect(page.locator('#storybook-root h1, #storybook-root form').first()).toBeVisible();
  await page.evaluate('document.fonts.ready');
}

async function gatingViolations(page: import('@playwright/test').Page) {
  const results = await new AxeBuilder({ page }).include('#storybook-root').analyze();
  return results.violations
    .filter((v) => v.impact === 'critical' || v.impact === 'serious')
    .map((v) => `${v.impact} ${v.id} (${v.nodes.length} nodes): ${v.help}`);
}

for (const { id, name } of stories) {
  for (const width of breakpoints) {
    test(`${name} @ ${width}px — no horizontal overflow, axe clean`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await open(page, id, 'en');
      const overflow = await page.evaluate<number>(
        'document.scrollingElement.scrollWidth - document.scrollingElement.clientWidth',
      );
      expect(overflow, 'page must not scroll horizontally').toBeLessThanOrEqual(0);
      expect(await gatingViolations(page)).toEqual([]);
    });
  }

  test(`${name} (vi) @ 375px — no horizontal overflow, axe clean`, async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 900 });
    await open(page, id, 'vi');
    const overflow = await page.evaluate<number>(
      'document.scrollingElement.scrollWidth - document.scrollingElement.clientWidth',
    );
    expect(overflow, 'page must not scroll horizontally').toBeLessThanOrEqual(0);
    expect(await gatingViolations(page)).toEqual([]);
  });
}

test('login: Tab reaches the fields, the password toggle, the buttons and the provider links in order', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await open(page, 'login-pages--login', 'en');
  const order: string[] = [];
  for (let i = 0; i < 14; i += 1) {
    await page.keyboard.press('Tab');
    order.push(
      await page.evaluate<string>(
        "(() => { const e = document.activeElement; return e ? (e.id || e.getAttribute('aria-label') || e.textContent || e.tagName).trim().slice(0, 40) : ''; })()",
      ),
    );
  }
  const expected = [
    'English',
    'Tiếng Việt',
    'username',
    'Forgot password?',
    'password',
    'Show password',
    'kc-login',
    'social-google',
    'social-facebook',
    'social-zalo',
  ];
  // The language links come first (they sit above the form); the rest follow visual order.
  expect(order.slice(0, expected.length)).toEqual(expected);
});

test('register: every field and the submit button are reachable by Tab', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await open(page, 'login-pages--register', 'en');
  const reached = new Set<string>();
  for (let i = 0; i < 20; i += 1) {
    await page.keyboard.press('Tab');
    reached.add(await page.evaluate<string>('document.activeElement?.id ?? ""'));
  }
  for (const field of ['password', 'password-confirm', 'email', 'firstName', 'lastName']) {
    expect(reached, `Tab should reach #${field}`).toContain(field);
  }
  // A27: the registration page shows no username field (the flow fills it on the server), so no Tab stop is a username.
  // AUTH-19: this test used to expect `#username` and had been failing since A27.
  expect(reached, 'the page must not offer a username field').not.toContain('username');
});

test('register: the show-password buttons draw an eye and reveal the password', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await open(page, 'login-pages--register', 'en');
  const buttons = page.locator('button').filter({ has: page.locator('.kc-eye') });
  await expect(buttons).toHaveCount(2);
  // The stock glyph font is not shipped: the icon is a CSS mask, so it needs a size and a mask image.
  const eye = page.locator('.kc-eye').first();
  expect((await eye.boundingBox())?.width).toBeGreaterThan(8);
  expect(
    await page.evaluate<string>(
      "(() => { const s = getComputedStyle(document.querySelector('.kc-eye')); return s.maskImage || s.webkitMaskImage; })()",
    ),
  ).not.toBe('none');
  await page.locator('#password').fill('secret-123');
  await buttons.first().click();
  await expect(page.locator('#password')).toHaveAttribute('type', 'text');
  await expect(page.locator('.kc-eye-off')).toHaveCount(1);
});

test('register: Back to log in sits under the create button on the left, Forgot password on the right', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await open(page, 'login-pages--register', 'en');
  const submit = await page.locator('#kc-form-buttons input[type=submit]').boundingBox();
  const back = await page.getByRole('link', { name: /Back to log in/ }).boundingBox();
  const forgot = await page.getByRole('link', { name: 'Forgot password?' }).boundingBox();
  expect(back!.y).toBeGreaterThan(submit!.y + submit!.height - 1);
  expect(Math.abs(back!.y - forgot!.y)).toBeLessThan(4);
  expect(back!.x).toBeLessThan(forgot!.x);
  expect(Math.abs(back!.x - submit!.x)).toBeLessThan(2);
});
