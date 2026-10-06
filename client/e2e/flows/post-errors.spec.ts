import type { Page } from '@playwright/test';
import { seedAuthenticatedSession } from '../mocks/fixtures.ts';
import { expect, test } from '../mocks/test.ts';

/*
 * CLIENT-ERR-6: the post module's coded errors (A18), localized from the error code, end to end.
 * Server errors are forced with `page.route` (the MSW feed handlers do not fail on their own).
 * Behavior table: client/docs/MVP/CLIENT-ERR-6_POST_ERROR_ADAPTATION.md.
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

const popUp = (page: Page, name = 'Post unavailable') => page.getByRole('dialog', { name });

test('a shared link to a deleted post opens the error pop-up, never the comments modal', async ({ page }) => {
  await forceFailure(page, /\/api\/posts\/999$/, 'GET', 404, 'POST_NOT_FOUND');
  await seedAuthenticatedSession(page, '/posts/999');

  const dialog = popUp(page);
  await expect(dialog.getByRole('alert')).toHaveText('This post no longer exists.');
  await expect(page.getByRole('button', { name: 'Close' })).toHaveCount(0); // no comments modal behind it
  await expect(page.locator('[data-sonner-toast]')).toHaveCount(0);

  await dialog.getByRole('button', { name: 'Got it' }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page).toHaveURL('/');
  await expect(page.getByRole('article').first()).toBeVisible();
});

test('the same pop-up is localized in Vietnamese', async ({ page }) => {
  // Log in in English first (the fixture's login form is English), then store the locale and reload
  // straight onto the dead link: the session comes back through the refresh cookie.
  await seedAuthenticatedSession(page);
  await page.evaluate(() => {
    localStorage.setItem('locale-storage', JSON.stringify({ state: { locale: 'vi' }, version: 0 }));
  });
  await forceFailure(page, /\/api\/posts\/999$/, 'GET', 403, 'POST_FORBIDDEN');
  await page.goto('/posts/999');

  const dialog = popUp(page, 'Bài viết không khả dụng');
  await expect(dialog.getByRole('alert')).toHaveText('Bạn không có quyền xem bài viết này.');
  await dialog.getByRole('button', { name: 'Đã hiểu' }).click();
  await expect(page).toHaveURL('/');
});

test('a comment on a post that vanished opens the pop-up over the modal, and Got it closes both', async ({
  page,
}) => {
  await seedAuthenticatedSession(page);
  await forceFailure(page, /\/api\/posts\/\d+\/comments$/, 'POST', 404, 'POST_NOT_FOUND');

  await page.getByRole('article').first().getByRole('button', { name: 'View comments' }).click();
  const comments = page.getByRole('dialog').filter({ has: page.getByLabel('Add a comment') });
  await comments.getByLabel('Add a comment').fill('Anyone still there?');
  await comments.getByRole('button', { name: 'Post comment' }).click();

  const dialog = popUp(page);
  await expect(dialog.getByRole('alert')).toHaveText('This post no longer exists.');
  await expect(page.locator('[data-sonner-toast]')).toHaveCount(0);

  await dialog.getByRole('button', { name: 'Got it' }).click();
  await expect(dialog).not.toBeVisible();
  await expect(comments).not.toBeVisible();
  await expect(page).toHaveURL('/');
});

test('liking a post that was deleted opens the pop-up from the feed card', async ({ page }) => {
  await seedAuthenticatedSession(page);
  await forceFailure(page, /\/api\/posts\/\d+\/like$/, 'POST', 404, 'POST_NOT_FOUND');

  await page.getByRole('button', { name: 'Like' }).first().click();

  const dialog = popUp(page);
  await expect(dialog.getByRole('alert')).toHaveText('This post no longer exists.');
  await dialog.getByRole('button', { name: 'Got it' }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole('article').first()).toBeVisible();
});

test('deleting a post you may not delete opens the pop-up, and the post stays', async ({ page }) => {
  await seedAuthenticatedSession(page);
  await forceFailure(page, /\/api\/posts\/\d+$/, 'DELETE', 403, 'POST_DELETE_FORBIDDEN');

  const articles = page.getByRole('article');
  await expect(articles.first()).toBeVisible();
  const before = await articles.count();
  await articles.first().getByRole('button', { name: 'Post options' }).click();
  await page.getByRole('menuitem', { name: 'Delete post' }).click();

  const dialog = popUp(page);
  await expect(dialog.getByRole('alert')).toHaveText('You can’t delete this post.');
  await dialog.getByRole('button', { name: 'Got it' }).click();
  await expect(dialog).not.toBeVisible();
  await expect(articles).toHaveCount(before);
});

test('a repeat like (409) says nothing: no toast, no pop-up, the post shows its true state', async ({ page }) => {
  await seedAuthenticatedSession(page);
  await forceFailure(page, /\/api\/posts\/\d+\/like$/, 'POST', 409, 'POST_ALREADY_LIKED');

  await page.getByRole('button', { name: 'Like' }).first().click();

  // The optimistic flip rolls back and the refetch restores the server's state.
  await expect(page.getByRole('button', { name: 'Like' }).first()).toContainText('3');
  await expect(page.locator('[data-sonner-toast]')).toHaveCount(0);
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('a failed comment delete with COMMENT_NOT_FOUND is silent', async ({ page }) => {
  await seedAuthenticatedSession(page);
  await forceFailure(page, /\/api\/posts\/comments\/\d+$/, 'DELETE', 404, 'COMMENT_NOT_FOUND');

  await page.getByRole('article').first().getByRole('button', { name: 'View comments' }).click();
  const comments = page.getByRole('dialog').filter({ has: page.getByLabel('Add a comment') });
  await comments.getByLabel('Add a comment').fill('Temporary note');
  await comments.getByRole('button', { name: 'Post comment' }).click();
  await expect(comments.getByText('Temporary note')).toBeVisible();

  await comments.getByRole('button', { name: 'Comment options' }).first().click();
  await page.getByRole('menuitem', { name: 'Delete' }).click();

  await expect(page.locator('[data-sonner-toast]')).toHaveCount(0);
  await expect(page.getByRole('dialog', { name: 'Post unavailable' })).toHaveCount(0);
  await expect(comments).toBeVisible();
});

test('creating a group post as a non-member shows the specific line under the composer', async ({ page }) => {
  await seedAuthenticatedSession(page);
  await forceFailure(page, /\/api\/posts$/, 'POST', 403, 'POST_GROUP_MEMBER_REQUIRED');

  await page.getByLabel('Create a post').fill('Hello group');
  await page.getByRole('button', { name: 'Post', exact: true }).click();

  await expect(page.getByText('Join this group to post here.')).toBeVisible();
  await expect(page.locator('[data-sonner-toast]')).toHaveCount(0);
});
