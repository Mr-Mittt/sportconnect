import type { Page } from '@playwright/test';
import { mockDiscoverableSession, seedAuthenticatedSession } from '../mocks/fixtures.ts';
import { expect, test } from '../mocks/test.ts';

/*
 * CLIENT-ERR-7: the session module's coded errors (SESSION-45), localized from the error code, end
 * to end. Server errors are forced with `page.route` on top of the MSW session handlers.
 * Behavior table: client/docs/MVP/CLIENT-ERR-7_SESSION_ERROR_ADAPTATION.md.
 */

function coded(status: number, errorCode: string) {
  return {
    status,
    contentType: 'application/json',
    body: JSON.stringify({
      success: false,
      message: 'English server prose',
      data: null,
      errorCode,
      timestamp: '',
    }),
  };
}

/** Forces one method on one URL to fail with a coded error; everything else falls through to MSW. */
async function forceFailure(page: Page, url: RegExp, method: string, status: number, errorCode: string) {
  await page.route(url, (route) =>
    route.request().method() !== method ? route.fallback() : route.fulfill(coded(status, errorCode)),
  );
}

const errorDialog = (page: Page, name = 'Session unavailable') => page.getByRole('dialog', { name });
const joinUrl = new RegExp(`/api/sessions/${mockDiscoverableSession.id}/join$`);

async function openDiscoverableSession(page: Page) {
  await page
    .getByRole('region', { name: 'Discover sessions' })
    .getByRole('button', { name: new RegExp(`${mockDiscoverableSession.title} — View details`) })
    .click();
  return page.getByRole('dialog', { name: mockDiscoverableSession.title! });
}

test('a join that hits a cancelled session shows the error dialog and keeps the session modal open', async ({
  page,
}) => {
  await seedAuthenticatedSession(page, '/matches');
  await forceFailure(page, joinUrl, 'POST', 409, 'SESSION_CANCELLED');
  const detail = await openDiscoverableSession(page);

  await detail.getByRole('button', { name: 'Join' }).click();

  const dialog = errorDialog(page);
  await expect(dialog.getByRole('alert')).toHaveText('This session has been cancelled.');
  await expect(page.locator('[data-sonner-toast]')).toHaveCount(0);
  // The failed join no longer also draws the inline "Couldn't complete that" line behind it.
  await expect(detail.getByText("Couldn't complete that action. Try again.")).toHaveCount(0);

  await dialog.getByRole('button', { name: 'Got it' }).click();
  await expect(dialog).not.toBeVisible();
  await expect(detail).toBeVisible();
});

test('a join that is refused with a 403 shows the dialog and Got it closes the session modal', async ({ page }) => {
  await seedAuthenticatedSession(page, '/matches');
  await forceFailure(page, joinUrl, 'POST', 403, 'SESSION_GROUP_MEMBER_REQUIRED');
  const detail = await openDiscoverableSession(page);

  await detail.getByRole('button', { name: 'Join' }).click();

  const dialog = errorDialog(page);
  await expect(dialog.getByRole('alert')).toHaveText('Only members of this group can do that. Join the group first.');
  await dialog.getByRole('button', { name: 'Got it' }).click();
  await expect(dialog).not.toBeVisible();
  await expect(detail).not.toBeVisible();
});

test('the same dialog is localized in Vietnamese', async ({ page }) => {
  // Log in in English first (the fixture's login form is English), then store the locale and reload.
  await seedAuthenticatedSession(page, '/matches');
  await page.evaluate(() => {
    localStorage.setItem('locale-storage', JSON.stringify({ state: { locale: 'vi' }, version: 0 }));
  });
  await forceFailure(page, joinUrl, 'POST', 404, 'SESSION_NOT_FOUND');
  await page.reload();
  await page
    .getByRole('button', { name: new RegExp(`${mockDiscoverableSession.title} — `) })
    .first()
    .click();
  await page.getByRole('dialog', { name: mockDiscoverableSession.title! }).getByRole('button', { name: 'Tham gia' }).click();

  const dialog = errorDialog(page, 'Buổi chơi không khả dụng');
  await expect(dialog.getByRole('alert')).toHaveText('Buổi chơi này không còn tồn tại.');
  await dialog.getByRole('button', { name: 'Đã hiểu' }).click();
  await expect(dialog).not.toBeVisible();
});

test('opening a session that no longer exists shows the "no longer available" state with a Close button', async ({
  page,
}) => {
  await seedAuthenticatedSession(page, '/matches');
  await forceFailure(page, new RegExp(`/api/sessions/${mockDiscoverableSession.id}$`), 'GET', 404, 'SESSION_NOT_FOUND');

  await page
    .getByRole('region', { name: 'Discover sessions' })
    .getByRole('button', { name: new RegExp(`${mockDiscoverableSession.title} — View details`) })
    .click();

  const modal = page.getByRole('dialog').filter({ hasText: 'No longer available' });
  await expect(modal).toBeVisible();
  await expect(modal.getByText("Couldn't load this session.")).toHaveCount(0);
  await expect(page.locator('[data-sonner-toast]')).toHaveCount(0);

  await modal.getByRole('button', { name: 'Close' }).last().click();
  await expect(modal).not.toBeVisible();
});

test('leaving from a card when the caller is no longer a participant shows the dialog, no modal involved', async ({
  page,
}) => {
  await seedAuthenticatedSession(page, '/matches');
  await forceFailure(page, /\/api\/sessions\/\d+\/leave$/, 'DELETE', 409, 'SESSION_NOT_PARTICIPANT');

  await page.getByRole('button', { name: /Friday 5-a-side — Leave/ }).click();

  const dialog = errorDialog(page);
  await expect(dialog.getByRole('alert')).toHaveText("You're no longer part of this session.");
  await expect(page.locator('[data-sonner-toast]')).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Got it' }).click();
  await expect(dialog).not.toBeVisible();
});
