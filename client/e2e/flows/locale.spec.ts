import { mockPassword, mockUser } from '../mocks/fixtures.ts';
import { expect, test } from '../mocks/test.ts';

/**
 * CLIENT-I18N-1's e2e proof: `Accept-Language` follows the in-app locale (`I18N_READINESS.md`
 * I18N-2), verified against real outgoing requests rather than a mocked handler's own behavior.
 * No language-picker UI ships in this ticket (CLIENT-REF-1/3 build one later), so "switching
 * locale" here means writing `localeStore`'s persisted key directly, via `addInitScript` —
 * exactly what a future picker's `setLocale` call would do to the same storage key.
 *
 * CLIENT-I18N-2 (step 1): the vi-locale test below now asserts the real Vietnamese `LoginForm`
 * labels — until this ticket, `/login` never translated anything, so it incidentally passed with
 * the still-English `getByLabel('Email')`/`getByRole('button', {name:'Log in'})` locators even
 * with `vi` active. Those are genuinely different strings now, not just a stale comment.
 *
 * CLIENT-I18N-4: same reasoning for the post-login assertion — Home Feed's `sr-only` `<h1>` is
 * now translated too, so the vi-locale test asserts "Bảng tin", not the stale English "Home Feed".
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
  // CLIENT-I18N-2: confirms the page actually rendered translated, not just the header changing.
  await expect(page.getByRole('heading', { name: 'Chào mừng trở lại' })).toBeVisible();

  // "Email" stays "Email" in the vi bundle (same convention as sign-up's Email field).
  // exact: true on both — "Mật khẩu" is a substring of the toggle button's "Hiện mật khẩu"/"Ẩn
  // mật khẩu" aria-label, same collision the English locator comment already calls out above.
  await page.getByLabel('Email', { exact: true }).fill(mockUser.email);
  await page.getByLabel('Mật khẩu', { exact: true }).fill(mockPassword);
  await page.getByRole('button', { name: 'Đăng nhập' }).click();
  await page.waitForURL('/');

  await expect(page.getByRole('heading', { name: 'Bảng tin' })).toBeVisible();
  expect(headers.length).toBeGreaterThan(0);
  expect(headers.every((header) => header === 'vi')).toBe(true);
});

/**
 * CLIENT-I18N-7: the Groups page renders translated under a stored `vi` locale — the page's
 * sr-only heading, the discovery panel's buttons, and the Create Group modal all read from the
 * `groups` namespace.
 */
test('Groups page renders Vietnamese copy under a stored vi locale', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('locale-storage', JSON.stringify({ state: { locale: 'vi' }, version: 0 }));
  });

  await page.goto('/login');
  await page.getByLabel('Email', { exact: true }).fill(mockUser.email);
  await page.getByLabel('Mật khẩu', { exact: true }).fill(mockPassword);
  await page.getByRole('button', { name: 'Đăng nhập' }).click();
  await page.waitForURL('/');

  await page.getByRole('navigation').getByRole('button', { name: 'Nhóm', exact: true }).click();
  await expect(page).toHaveURL('/groups');
  await expect(page.getByRole('heading', { name: 'Nhóm', level: 1 })).toBeAttached();
  await expect(page.getByRole('button', { name: 'Tham gia nhóm' })).toBeVisible();

  await page.getByRole('button', { name: 'Tạo nhóm' }).click();
  const dialog = page.getByRole('dialog', { name: 'Tạo nhóm' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel('Tên nhóm', { exact: true })).toBeVisible();
});

/**
 * CLIENT-I18N-8: the Friends page renders translated under a stored `vi` locale — the page's
 * sr-only heading, the rail's search/add controls, and the four section headers all read from
 * the `friends` namespace.
 */
test('Friends page renders Vietnamese copy under a stored vi locale', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('locale-storage', JSON.stringify({ state: { locale: 'vi' }, version: 0 }));
  });

  await page.goto('/login');
  await page.getByLabel('Email', { exact: true }).fill(mockUser.email);
  await page.getByLabel('Mật khẩu', { exact: true }).fill(mockPassword);
  await page.getByRole('button', { name: 'Đăng nhập' }).click();
  await page.waitForURL('/');

  await page.getByRole('navigation').getByRole('button', { name: 'Bạn bè', exact: true }).click();
  await expect(page).toHaveURL('/friends');
  await expect(page.getByRole('heading', { name: 'Bạn bè', level: 1 })).toBeAttached();
  await expect(page.getByLabel('Tìm bạn bè')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Thêm bạn' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Lời mời kết bạn \(\d+\)/ })).toBeVisible();
  await expect(page.getByText('Chọn một người bạn để xem hồ sơ và trò chuyện.')).toBeVisible();
});

/**
 * CLIENT-I18N-9: the notification bell renders translated under a stored `vi` locale — the
 * trigger's accessible name, the dropdown heading and its empty state read from the
 * `notifications` namespace.
 */
test('Notification bell renders Vietnamese copy under a stored vi locale', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('locale-storage', JSON.stringify({ state: { locale: 'vi' }, version: 0 }));
  });

  await page.goto('/login');
  await page.getByLabel('Email', { exact: true }).fill(mockUser.email);
  await page.getByLabel('Mật khẩu', { exact: true }).fill(mockPassword);
  await page.getByRole('button', { name: 'Đăng nhập' }).click();
  await page.waitForURL('/');

  await page.getByRole('button', { name: 'Thông báo' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText('Thông báo', { exact: true })).toBeVisible();
});
