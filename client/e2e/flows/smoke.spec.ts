import { seedAuthenticatedSession } from '../mocks/fixtures.ts';
import { expect, test } from '../mocks/test.ts';

test('shell renders and NavTabs navigate between routes', async ({ page }) => {
  // Home Feed sits behind ProtectedRoute (AUTH-4) — seed a session first.
  await seedAuthenticatedSession(page);
  await expect(page.getByRole('heading', { name: 'Home Feed' })).toBeVisible();
  await expect(page.getByText('SportHub', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Friends' }).click();
  await expect(page.getByRole('heading', { name: 'Friends' })).toBeVisible();
  await expect(page).toHaveURL(/\/friends$/);

  await page.getByRole('button', { name: 'Home' }).click();
  await expect(page.getByRole('heading', { name: 'Home Feed' })).toBeVisible();
});
