import {
  seedAuthenticatedSession,
  seedPaginatedFeedOnNextLoad,
  seedZeroSportProfilesOnNextLoad,
} from '../mocks/fixtures.ts';
import { expect, test } from '../mocks/test.ts';

/*
 * FEED-10: the 8(+1 SPORT-1 delta)-step feed/groups journey (AUTH/FEED epic
 * § FEED-10), mirroring HF-11's home-feed-journey.spec.ts structure (one
 * `test()`, sequential `test.step()`s) but spanning both Home Feed and the
 * Groups page.
 *
 * Fixture setup, distinct from HF-11's 3-post default:
 * - `seedPaginatedFeedOnNextLoad` (e2e/mocks/paginatedFeed.ts) replaces the
 *   shared postsState with 21 posts before the app's first fetch — one more
 *   than usePersonalFeed's page size, so "Load more" fetches a real second
 *   page. Two posts are special-cased: index 19 (last on page 0) is a
 *   GROUP_POST for `mockGroup`, reused by step 5; index 20 (only reachable
 *   via "Load more") is Basketball rather than Soccer, reused by step 9's
 *   sport-filter check. Since this replaces postsState wholesale, none of
 *   HF-11's usual fixtures (mockPost/mockGroupPost/mockBasketballPost) are
 *   present in this spec — every assertion below targets the paginated set.
 * - `mockOwnedGroup` (fixtures.ts) is a second pre-seeded group where the
 *   test user is `group_owner` (vs. `mockGroup`'s `group_member`) — the
 *   dedicated fixture for step 8's admin/non-admin broadcast-toggle check.
 * - Broadcasts/trending are unaffected by the postsState replacement (they
 *   come from separate handler state — mockBroadcastPost/mockHashtag) — step
 *   7 exercises those exactly as HF-11 already established.
 * - Step 4's "MSW-simulated error response" (FEED-10's acceptance
 *   criterion) uses `overrideCreatePostToFailOnce` (mid-test, not on next
 *   load — see failCreatePostOnce.ts) against the newly-wired
 *   CreatePostForm `isError` state (FEED-10 product fix, since FEED-8 never
 *   surfaced create-post failures anywhere).
 */

test('Feed/groups journey', async ({ page }) => {
  await seedPaginatedFeedOnNextLoad(page);
  await seedAuthenticatedSession(page);
  // Scoped to GroupSpaceSwitcher specifically — "Friday Night Football" also
  // appears as a Group Broadcasts rail row, an ambiguous unscoped match.
  const groupSwitcher = page.getByRole('group', { name: 'Group filter' });

  await test.step('1. load — 20 posts render (page 0), "Load more" fetches a real second page', async () => {
    await expect(page.getByRole('article')).toHaveCount(20);
    await expect(page.getByText('Pickup game this weekend')).not.toBeVisible();

    await page.getByRole('button', { name: 'Load more' }).click();
    await expect(page.getByRole('article')).toHaveCount(21);
    await expect(page.getByText('Pickup game this weekend', { exact: false })).toBeVisible();
    await expect(page.getByRole('button', { name: /load more/i })).not.toBeVisible();
  });

  await test.step('2. like toggle — fills and increments, reverts on second click', async () => {
    const like = page.getByRole('button', { name: 'Like' }).first();
    await expect(like).toContainText('3'); // mockPost's base likeCount, inherited by every seeded post
    await like.click();

    const unlike = page.getByRole('button', { name: 'Unlike' }).first();
    await expect(unlike).toHaveAttribute('aria-pressed', 'true');
    await expect(unlike).toContainText('4');
    await unlike.click();

    const reverted = page.getByRole('button', { name: 'Like' }).first();
    await expect(reverted).toHaveAttribute('aria-pressed', 'false');
    await expect(reverted).toContainText('3');
  });

  await test.step('3. add a comment — appears, commentCount increments', async () => {
    const firstArticle = page.getByRole('article').first();
    await expect(firstArticle.getByRole('button', { name: 'View comments' })).toContainText('1');
    await firstArticle.getByRole('button', { name: 'View comments' }).click();

    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Add a comment').fill('Great turnout today!');
    await dialog.getByRole('button', { name: 'Post', exact: true }).click();
    await expect(dialog.getByText('Great turnout today!')).toBeVisible();
    await dialog.getByRole('button', { name: 'Close' }).click();

    await expect(firstArticle.getByRole('button', { name: 'View comments' })).toContainText('2');
  });

  await test.step('4. create a post — a simulated failure surfaces an error, then a retry succeeds', async () => {
    await page.evaluate(
      "import('/e2e/mocks/failCreatePostOnce.ts')" +
        '.then(({ overrideCreatePostToFailOnce }) => overrideCreatePostToFailOnce(window.__mswWorker))',
    );

    const composer = page.getByLabel('Create a post');
    await composer.fill('First attempt — should fail');
    await page.getByRole('button', { name: 'Post', exact: true }).click();
    await expect(page.getByText("Couldn't create post. Try again.")).toBeVisible();
    // The composer clears on submit regardless of outcome (CreatePostForm's
    // existing behavior, not changed by FEED-10) — retyping is the retry.
    await expect(composer).toHaveValue('');

    await composer.fill('Great match, see everyone next week!');
    await page.getByRole('button', { name: 'Post', exact: true }).click();
    await expect(page.getByText("Couldn't create post. Try again.")).not.toBeVisible();
    await expect(page.getByRole('article').first()).toContainText(
      'Great match, see everyone next week!',
    );
    await expect(page.getByRole('article')).toHaveCount(22);
  });

  await test.step('5. switch to a group\'s feed via the group switcher — content changes to that group\'s posts', async () => {
    await page.getByRole('navigation', { name: 'Primary' }).getByRole('button', { name: 'Groups' }).click();
    await expect(page).toHaveURL('/groups');

    await groupSwitcher.getByRole('button', { name: /Friday Night Football/ }).click();
    await expect(page.getByRole('article')).toHaveCount(1);
    await expect(page.getByRole('article')).toContainText("Who's in for Friday training?");
  });

  await test.step('6. create a group — appears in the switcher and is selectable immediately', async () => {
    await groupSwitcher.getByRole('button', { name: 'Group options' }).click();
    await page.getByRole('menuitem', { name: 'Create Group' }).click();

    const dialog = page.getByRole('dialog');
    await dialog.locator('#create-group-name').fill('Sunday Runners');
    await dialog.locator('#create-group-sport').selectOption({ label: 'Football' });
    await dialog.getByRole('button', { name: 'Create group' }).click();
    await expect(dialog).not.toBeVisible();

    await expect(
      groupSwitcher.getByRole('button', { name: /Sunday Runners/ }),
    ).toHaveAttribute('aria-pressed', 'true');
    // A brand-new group has no posts yet.
    await expect(page.getByText('No posts yet for this sport.')).toBeVisible();
  });

  await test.step('7. Trending Hashtags and Group Broadcasts render from their own fixtures; the expired broadcast is excluded', async () => {
    const trending = page.getByRole('region', { name: 'Trending hashtags' });
    const broadcasts = page.getByRole('region', { name: 'Group broadcasts' });
    // Unaffected by this spec's postsState replacement — trending/broadcasts
    // come from separate handler state (mockHashtag/broadcastsState).
    await expect(trending.getByRole('button')).toHaveCount(1);
    await expect(trending).toContainText('#fridayrun');
    // broadcastsState holds mockBroadcastPost (active) + mockExpiredBroadcastPost
    // (expired) — the handler's expiry filter excludes the latter, so exactly
    // 1 row renders, not 2.
    await expect(broadcasts.getByRole('button')).toHaveCount(1);
  });

  await test.step('8. "Broadcast" toggle — absent for a member (mockGroup), present for the owner (mockOwnedGroup)', async () => {
    await groupSwitcher.getByRole('button', { name: /Friday Night Football/ }).click();
    await expect(page.getByRole('button', { name: /Broadcast/ })).not.toBeVisible();

    await groupSwitcher.getByRole('button', { name: /Weekend Tennis Ladder/ }).click();
    await expect(page.getByRole('button', { name: /Broadcast/ })).toBeVisible();
  });

  await test.step('9. SPORT-1 delta — switching to a real sport profile filters the feed', async () => {
    await page.getByRole('navigation', { name: 'Primary' }).getByRole('button', { name: 'Home' }).click();
    await expect(page).toHaveURL('/');

    await page.getByRole('button', { name: 'Basketball', exact: true }).click();
    await expect(page.getByRole('article')).toHaveCount(1);
    await expect(page.getByRole('article')).toContainText('Pickup game this weekend');

    await page.getByRole('button', { name: 'All', exact: true }).click();
    await expect(page.getByRole('article')).toHaveCount(22);
  });
});

/*
 * SPORT-1 delta, isolated: a user with zero sport profiles (impossible in
 * the main journey above, which needs the primary fixture user's 3-sport
 * cap for step 9) must still render Home Feed without crashing — same
 * "separate small test()" precedent as a11y.spec.ts's multiple independent
 * tests in one file.
 */
test('zero sport profiles renders without error', async ({ page }) => {
  await seedZeroSportProfilesOnNextLoad(page);
  await seedAuthenticatedSession(page);

  await expect(page.getByRole('group', { name: 'Sport filter' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'All', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add sport' })).toBeVisible();
  // No sport pills besides "All" and "Add sport" — zero profiles, not a crash.
  await expect(page.getByRole('group', { name: 'Sport filter' }).getByRole('button')).toHaveCount(2);
});
