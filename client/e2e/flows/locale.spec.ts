import { mockPassword, mockUser } from '../mocks/fixtures.ts';
import { expect, test } from '../mocks/test.ts';

/**
 * CLIENT-I18N-1's e2e proof: `Accept-Language` follows the in-app locale (`I18N_READINESS.md`
 * I18N-2), verified against real outgoing requests rather than a mocked handler's own behavior.
 * No language-picker UI ships in this ticket (CLIENT-REF-1/3 build one later), so "switching
 * locale" here means writing `localeStore`'s persisted key directly, via `addInitScript` —
 * exactly what a future picker's `setLocale` call would do to the same storage key.
 */

test('Accept-Language defaults to en with nothing stored', async ({ page }) => {
  const headers: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/api/')) {
      const header = request.headers()['accept-language'];
      if (header) headers.push(header);
    }
  });

  await page.goto('/login');
  await page.getByLabel('Email', { exact: true }).fill(mockUser.email);
  await page.getByLabel('Password', { exact: true }).fill(mockPassword);
  await page.getByRole('button', { name: 'Log in' }).click();
  await page.waitForURL('/');

  await expect(page.getByRole('heading', { name: 'Home Feed' })).toBeVisible();
  expect(headers.length).toBeGreaterThan(0);
  expect(headers.every((header) => header === 'en')).toBe(true);
});

test('Accept-Language follows a locale stored before the app loads', async ({ page }) => {
  // Seeds the exact shape zustand's persist middleware writes (state.locale) — reinstalled on
  // every navigation, so it's in place before localeStore's module-level detectBrowserLocale
  // default is ever read.
  await page.addInitScript(() => {
    localStorage.setItem('locale-storage', JSON.stringify({ state: { locale: 'vi' }, version: 0 }));
  });

  const headers: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/api/')) {
      const header = request.headers()['accept-language'];
      if (header) headers.push(header);
    }
  });

  await page.goto('/login');
  await expect(page.locator('html')).toHaveAttribute('lang', 'vi');

  await page.getByLabel('Email', { exact: true }).fill(mockUser.email);
  await page.getByLabel('Password', { exact: true }).fill(mockPassword);
  await page.getByRole('button', { name: 'Log in' }).click();
  await page.waitForURL('/');

  await expect(page.getByRole('heading', { name: 'Home Feed' })).toBeVisible();
  expect(headers.length).toBeGreaterThan(0);
  expect(headers.every((header) => header === 'vi')).toBe(true);
});
