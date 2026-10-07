import type { Page } from '@playwright/test';
import { expect, test } from '../mocks/test.ts';

/*
 * CLIENT-ERR-8: the reference module's coded errors (REF-5), localized from the error code, end to
 * end. A rejected country / region shows in the geo fields' own hint line, not in the form banner,
 * and clears the stale selection. The server errors are forced with `page.route` (the MSW register
 * handler only fails on a taken email). The location favorite and notification codes are covered by
 * Vitest (silent stale 409s, refetch on a gone notification). Behavior table:
 * client/docs/MVP/CLIENT-ERR-8_MISC_ERROR_ADAPTATION.md.
 */

async function forceRegisterError(page: Page, errorCode: string, message: string) {
  await page.route('**/api/auth/register', (route) =>
    route.fulfill({
      status: 400,
      contentType: 'application/json',
      body: JSON.stringify({ success: false, message, data: null, errorCode, timestamp: '' }),
    }),
  );
}

async function useVietnamese(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('locale-storage', JSON.stringify({ state: { locale: 'vi' }, version: 0 }));
  });
}

test.describe('register: a rejected country or region', () => {
  test('REGION_UNKNOWN shows the hint line, not the banner, and keeps the typed fields', async ({ page }) => {
    await forceRegisterError(page, 'REGION_UNKNOWN', 'Unknown or inactive region');
    await page.goto('/register');
    await page.locator('#register-email').fill('new-player@example.com');
    await page.locator('#register-password').fill('password123');
    await page.locator('#register-full-name').fill('New Player');
    await page.getByRole('button', { name: 'Create account' }).click();

    await expect(page.getByText('That region is no longer available. Pick another one.')).toBeVisible();
    await expect(page.getByRole('alert')).toHaveCount(0);
    await expect(page.locator('#register-email')).toHaveValue('new-player@example.com');
    await expect(page.locator('#register-full-name')).toHaveValue('New Player');
  });

  test('REGION_UNKNOWN in vi', async ({ page }) => {
    await useVietnamese(page);
    await forceRegisterError(page, 'REGION_UNKNOWN', 'Unknown or inactive region');
    await page.goto('/register');
    await page.locator('#register-email').fill('new-player@example.com');
    await page.locator('#register-password').fill('password123');
    await page.locator('#register-full-name').fill('Người Chơi');
    await page.getByRole('button', { name: 'Tạo tài khoản' }).click();

    await expect(page.getByText('Khu vực này không còn khả dụng. Hãy chọn khu vực khác.')).toBeVisible();
    await expect(page.getByRole('alert')).toHaveCount(0);
  });

  test('COUNTRY_UNKNOWN clears the country pick', async ({ page }) => {
    await forceRegisterError(page, 'COUNTRY_UNKNOWN', 'Unknown or inactive country');
    await page.goto('/register');
    await page.getByLabel('Country').selectOption({ index: 1 });
    await expect(page.getByLabel('Country')).not.toHaveValue('');
    await page.locator('#register-email').fill('new-player@example.com');
    await page.locator('#register-password').fill('password123');
    await page.locator('#register-full-name').fill('New Player');
    await page.getByRole('button', { name: 'Create account' }).click();

    await expect(page.getByText("That country isn't available. Pick another one.")).toBeVisible();
    await expect(page.getByLabel('Country')).toHaveValue('');
  });
});
