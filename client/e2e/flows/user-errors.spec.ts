import { seedAuthenticatedSession } from '../mocks/fixtures.ts';
import { expect, test } from '../mocks/test.ts';

/*
 * CLIENT-ERR-3: the user module's coded errors (U21), localized from the error code, end to end.
 * The form's own min/max stops an out-of-range height before it is sent, so the server errors here
 * are forced with `page.route`: a coded 400 on the profile PUT, and the two friend races (a request
 * answered elsewhere, an unfriend of someone who is already not a friend). Behavior table:
 * client/docs/MVP/CLIENT-ERR-3_USER_ERROR_ADAPTATION.md.
 */

async function openAccountSettings(page: import('@playwright/test').Page, avatarLabel: string, itemName: string) {
  await page.getByRole('button', { name: avatarLabel }).click();
  await page.getByRole('menuitem', { name: itemName }).click();
}

async function forceHeightError(page: import('@playwright/test').Page) {
  await page.route(/\/api\/users\/[^/]+\/profile$/,(route) =>
    route.request().method() !== 'PUT'
      ? route.fallback()
      : route.fulfill({
          status: 400,
          contentType: 'application/json',
          body: JSON.stringify({
            success: false,
            message: 'heightCm must be between 50 and 300',
            data: null,
            errorCode: 'HEIGHT_OUT_OF_RANGE',
            errorParams: { min: 50, max: 300 },
            timestamp: new Date().toISOString(),
          }),
        }),
  );
}

test('a height rejected by the server shows the localized message with the bounds, keeping the modal and input', async ({ page }) => {
  await seedAuthenticatedSession(page, '/profile');
  await forceHeightError(page);
  await openAccountSettings(page, 'Your account', 'Account settings');
  const dialog = page.getByRole('dialog', { name: 'Account settings' });
  await dialog.getByLabel('Height (cm)').fill('180');
  await dialog.getByRole('button', { name: 'Save changes' }).click();

  await expect(dialog.getByRole('alert')).toContainText('Height must be between 50 and 300 cm.');
  await expect(dialog.getByLabel('Height (cm)')).toHaveValue('180');
});

test('a height rejected by the server in vi', async ({ page }) => {
  await seedAuthenticatedSession(page, '/profile');
  await page.evaluate(() => {
    localStorage.setItem('locale-storage', JSON.stringify({ state: { locale: 'vi' }, version: 0 }));
  });
  await page.reload();
  await forceHeightError(page);
  await openAccountSettings(page, 'Tài khoản của bạn', 'Cài đặt tài khoản');
  const dialog = page.getByRole('dialog', { name: 'Cài đặt tài khoản' });
  await dialog.getByLabel('Chiều cao (cm)').fill('180');
  await dialog.getByRole('button', { name: 'Lưu thay đổi' }).click();

  await expect(dialog.getByRole('alert')).toContainText('Chiều cao phải từ 50 đến 300 cm.');
});

test('an unfriend of someone who is already not a friend shows the coded message in the dialog', async ({ page }) => {
  await seedAuthenticatedSession(page, '/friends');
  await page.route(/\/api\/users\/friends\/[^/]+$/, (route) => {
    if (route.request().method() !== 'DELETE') return route.fallback();
    return route.fulfill({
      status: 409,
      contentType: 'application/json',
      body: JSON.stringify({
        success: false,
        message: 'You are not friends with this user',
        data: null,
        errorCode: 'NOT_FRIENDS',
        timestamp: new Date().toISOString(),
      }),
    });
  });

  await page.getByRole('region', { name: 'Offline' }).getByText('Priya Shah').click();
  await page.getByRole('button', { name: 'Friend', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Unfriend' }).click();
  const confirm = page.getByRole('dialog');
  await confirm.getByRole('button', { name: 'Unfriend', exact: true }).click();

  await expect(confirm.getByRole('alert')).toContainText('You’re no longer friends with this person.');
});

test('accepting a request that was already answered toasts the localized message', async ({ page }) => {
  await seedAuthenticatedSession(page, '/friends');
  await page.route(/\/api\/users\/friends\/requests\/[^/]+\/accept$/, (route) =>
    route.fulfill({
      status: 409,
      contentType: 'application/json',
      body: JSON.stringify({
        success: false,
        message: 'Friend request is no longer pending',
        data: null,
        errorCode: 'FRIEND_REQUEST_NOT_PENDING',
        timestamp: new Date().toISOString(),
      }),
    }),
  );

  await page.getByRole('region', { name: 'Friend Requests' }).getByText('Hana Kim').click();
  await page.getByRole('button', { name: 'Accept', exact: true }).click();

  await expect(page.getByText('This friend request was already answered.')).toBeVisible();
});
