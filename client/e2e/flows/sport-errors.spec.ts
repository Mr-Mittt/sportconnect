import type { Page } from '@playwright/test';
import { seedAuthenticatedSession, seedZeroSportProfilesOnNextLoad } from '../mocks/fixtures.ts';
import { expect, test } from '../mocks/test.ts';

/*
 * CLIENT-ERR-4: the sport module's coded errors (A25), localized from the error code, end to end.
 * The server errors are forced with `page.route` (the MSW sport handler only fails on real
 * conflicts). Behavior table: client/docs/MVP/CLIENT-ERR-4_SPORT_ERROR_ADAPTATION.md.
 */

function coded(status: number, errorCode: string, message: string, errorParams?: Record<string, unknown>) {
  return {
    status,
    contentType: 'application/json',
    body: JSON.stringify({ success: false, message, data: null, errorCode, errorParams, timestamp: '' }),
  };
}

async function forceDuplicateProfile(page: Page) {
  await page.route('**/api/sports/profiles', (route) =>
    route.request().method() !== 'POST'
      ? route.fallback()
      : route.fulfill(
          coded(409, 'SPORT_PROFILE_ALREADY_EXISTS', 'User already has a profile for sport: Badminton', {
            sportName: 'Badminton',
          }),
        ),
  );
}

test('a duplicate sport profile shows the localized message and keeps the modal open', async ({
  page,
  mockSessionId,
}) => {
  await seedZeroSportProfilesOnNextLoad(mockSessionId);
  await seedAuthenticatedSession(page);
  await forceDuplicateProfile(page);

  await page.getByRole('button', { name: 'Add sport' }).click();
  const dialog = page.getByRole('dialog', { name: 'Add a sport' });
  await dialog.getByLabel('Skill level').selectOption('beginner');
  await dialog.getByRole('button', { name: 'Add sport' }).click();

  await expect(dialog.getByRole('alert')).toContainText('You already have a Badminton profile.');
  await expect(dialog.getByLabel('Skill level')).toHaveValue('beginner');
  await expect(page.locator('[data-sonner-toast]')).toHaveCount(0);
});

test('a duplicate sport profile in vi', async ({ page, mockSessionId }) => {
  await seedZeroSportProfilesOnNextLoad(mockSessionId);
  await seedAuthenticatedSession(page);
  await page.evaluate(() => {
    localStorage.setItem('locale-storage', JSON.stringify({ state: { locale: 'vi' }, version: 0 }));
  });
  await page.reload();
  await forceDuplicateProfile(page);

  await page.getByRole('button', { name: 'Thêm môn thể thao' }).click();
  const dialog = page.getByRole('dialog', { name: 'Thêm môn thể thao' });
  await dialog.getByLabel('Trình độ').selectOption('beginner');
  await dialog.getByRole('button', { name: 'Thêm môn thể thao' }).click();

  await expect(dialog.getByRole('alert')).toContainText('Bạn đã có hồ sơ Badminton rồi.');
});

test('an oversized attribute payload shows the generic line, never the 4 KB limit', async ({ page }) => {
  await seedAuthenticatedSession(page, '/profile');
  await page.route(/\/api\/sports\/profiles\/\d+$/, (route) =>
    route.request().method() !== 'PUT'
      ? route.fallback()
      : route.fulfill(
          coded(400, 'PROFILE_ATTRIBUTES_TOO_LARGE', 'Sport profile attributes exceed the maximum allowed size (4KB)', {
            maxBytes: 4096,
          }),
        ),
  );

  await page.getByRole('tab', { name: 'Settings' }).click();
  await page.getByLabel('Skill level').selectOption('advanced');
  await page.getByRole('button', { name: 'Save changes' }).click();

  const alert = page.getByRole('alert');
  await expect(alert).toContainText("Couldn't save your sport details. Please try again.");
  await expect(alert).not.toContainText('4KB');
  await expect(page.getByLabel('Skill level')).toHaveValue('advanced');
});

test('deactivating a profile that is already gone shows the coded message in the confirm dialog', async ({
  page,
}) => {
  await seedAuthenticatedSession(page, '/profile');
  await page.route(/\/api\/sports\/profiles\/\d+$/, (route) =>
    route.request().method() !== 'DELETE'
      ? route.fallback()
      : route.fulfill(coded(404, 'SPORT_PROFILE_NOT_FOUND', "UserSportProfile not found with id: '1'")),
  );

  await page.getByRole('tab', { name: 'Settings' }).click();
  await page.getByRole('switch', { name: /Badminton profile: Active/ }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Deactivate' }).click();

  await expect(dialog.getByRole('alert')).toContainText('This sport profile no longer exists.');
});
