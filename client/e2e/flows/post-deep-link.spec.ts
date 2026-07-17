import { seedAuthenticatedSession, seedPaginatedFeedOnNextLoad } from '../mocks/fixtures.ts';
import { expect, test } from '../mocks/test.ts';

/*
 * FEED-12: `/posts/:postId` is a real, URL-addressable route — a shared
 * comment-thread link works even for a post the viewer's feed has never
 * fetched (paginated further than they've scrolled, or a cold load in a
 * fresh tab with no prior feed fetch at all).
 *
 * Uses the same 21-post paginated fixture FEED-10 already established
 * (seedPaginatedFeedOnNextLoad) — post id 1020 (index 20) is only reachable
 * via "Load more" on the feed's own page 0, so loading it directly proves
 * the dialog doesn't depend on the feed having been paginated into first.
 */

test("loading a shared post link directly renders the post + comments, even outside the feed's first page", async ({
  page,
  mockSessionId,
}) => {
  await seedPaginatedFeedOnNextLoad(mockSessionId);
  // Drives the real "shared link, not logged in yet" flow end-to-end:
  // redirected to /login, then bounced back to the exact post after
  // authenticating — same mechanism any other protected deep link uses
  // (AUTH-8's step 7), not something FEED-12 had to build itself.
  await seedAuthenticatedSession(page, '/posts/1020');

  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText('Pickup game this weekend')).toBeVisible();
  await expect(dialog.getByText('No comments yet. Be the first to comment!')).toBeVisible();

  // The page underneath is the normal Home Feed (Option A), not a bare
  // shell — confirmed after closing, since Radix hides it from the a11y
  // tree while the dialog has focus.
  await dialog.getByRole('button', { name: 'Close' }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page).toHaveURL('/');
  await expect(page.getByRole('group', { name: 'Sport filter' })).toBeVisible();
  await expect(page.getByRole('article').first()).toBeVisible();
});

test('opening comments from the feed updates the URL, and closing returns to it', async ({
  page,
}) => {
  await seedAuthenticatedSession(page);

  const firstArticle = page.getByRole('article').first();
  await firstArticle.getByRole('button', { name: 'View comments' }).click();

  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(page).toHaveURL(/\/posts\/\d+$/);

  await dialog.getByRole('button', { name: 'Close' }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page).toHaveURL('/');
});
