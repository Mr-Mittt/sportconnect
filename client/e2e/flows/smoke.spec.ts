import { expect, test } from '@playwright/test';

test('shell renders and NavTabs navigate between routes', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Home Feed' })).toBeVisible();
  await expect(page.getByText('SportHub')).toBeVisible();

  await page.getByRole('button', { name: 'Friends' }).click();
  await expect(page.getByRole('heading', { name: 'Friends' })).toBeVisible();
  await expect(page).toHaveURL(/\/friends$/);

  await page.getByRole('button', { name: 'Home' }).click();
  await expect(page.getByRole('heading', { name: 'Home Feed' })).toBeVisible();
});
