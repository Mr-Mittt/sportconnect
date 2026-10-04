import { seedAuthenticatedSession, seedZeroSportProfilesOnNextLoad } from '../mocks/fixtures.ts';
import { expect, test } from '../mocks/test.ts';

/*
 * CLIENT-ERR-1: the app-wide error layer, end to end. Three things, each against the real running
 * app with only the network faked:
 *  1. an unknown URL lands on the not-found screen (en and vi) and "Back to home" works;
 *  2. a mutation with no inline error UI (the optimistic like) rolls back AND tells the user, via
 *     the global toast — a 500 and an unreachable server read differently;
 *  3. a mutation that already shows its own inline error does not toast as well.
 * The per-surface behavior table these assert is in `documentation/md/ERROR_HANDLING_DESIGN.md`.
 */

test('an unknown URL shows the not-found screen, and "Back to home" returns to the feed', async ({ page }) => {
  await seedAuthenticatedSession(page);

  await page.goto('/no/such/page');

  await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
  await page.getByRole('button', { name: 'Back to home' }).click();
  await expect(page.getByRole('heading', { name: 'Home Feed' })).toBeVisible();
});

test('the not-found screen follows the stored locale (vi)', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('locale-storage', JSON.stringify({ state: { locale: 'vi' }, version: 0 }));
  });

  await page.goto('/no/such/page');

  await expect(page.getByRole('heading', { name: 'Không tìm thấy trang' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Về trang chủ' })).toBeVisible();
});

test('a failed like rolls back and shows the server-error toast', async ({ page }) => {
  await seedAuthenticatedSession(page);
  await page.route('**/api/posts/*/like', (route) =>
    route.request().method() === 'POST'
      ? route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ success: false, message: 'An unexpected error occurred', data: null, timestamp: '' }),
        })
      : route.fallback(),
  );

  const like = page.getByRole('button', { name: 'Like' }).first();
  await expect(like).toContainText('3');
  await like.click();

  await expect(page.getByText('Something went wrong on our side. Try again.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Like' }).first()).toContainText('3');
});

test('a like with the network down shows the offline toast', async ({ page }) => {
  await seedAuthenticatedSession(page);
  await page.route('**/api/posts/*/like', (route) =>
    route.request().method() === 'POST' ? route.abort('failed') : route.fallback(),
  );

  await page.getByRole('button', { name: 'Like' }).first().click();

  await expect(page.getByText("Can't reach the server. Check your connection.")).toBeVisible();
});

test('a mutation with its own inline error shows it inline and does not also toast', async ({
  page,
  mockSessionId,
}) => {
  await seedZeroSportProfilesOnNextLoad(mockSessionId);
  await seedAuthenticatedSession(page);
  await page.route('**/api/sports/profiles', async (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    await route.fulfill({
      status: 400,
      contentType: 'application/json',
      body: JSON.stringify({
        success: false,
        message: 'Already has a profile for this sport',
        data: null,
        timestamp: '',
      }),
    });
  });

  await page.getByRole('button', { name: 'Add sport' }).click();
  const dialog = page.getByRole('dialog', { name: 'Add a sport' });
  await dialog.getByLabel('Skill level').selectOption('beginner');
  await dialog.getByRole('button', { name: 'Add sport' }).click();

  await expect(dialog.getByRole('alert')).toBeVisible();
  await expect(page.locator('[data-sonner-toast]')).toHaveCount(0);
});
