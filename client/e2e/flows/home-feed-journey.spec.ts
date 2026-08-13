import { seedAuthenticatedSession } from '../mocks/fixtures.ts';
import { expect, test } from '../mocks/test.ts';

/*
 * HF-11: the 7(+1)-step Home Feed journey (HF epic § HF-11). Feed/PostCard
 * are real now (FEED-1, usePersonalFeed via e2e/mocks/handlers/feed.ts's
 * stateful fixture — 3 posts: mockPost/mockGroupPost owned by the logged-in
 * test user "Jordan Lee" (Badminton, sportId 1), mockBasketballPost owned by
 * a friend "Priya Shah" (Pickleball, sportId 3)). SportSwitcher is real now
 * too (SPORT-1, via e2e/mocks/handlers/sport.ts's mockSportProfiles fixture).
 * Trending hashtags are real now too (FEED-6, via feed.ts's
 * `GET /api/hashtags/trending` handler — a single `mockHashtag`, `fridayrun`).
 * Group broadcasts are real now too (FEED-7, via groups.ts's single
 * `mockGroup`/feed.ts's single `mockBroadcastPost` — "Friday Night Football",
 * replacing the old mock array's 2 rows). Auto-waiting assertions only; no
 * sleeps.
 *
 * Premise corrections vs the epic's literal steps (user-approved; see the
 * backlog entry's deltas): the fixture user holds a profile for every sport
 * the catalog serves, so step 7 asserts HF-2's at-cap behavior
 * (aria-disabled).
 *
 * CLIENT-SESSION-1 update: matches are real now (modules/session via
 * e2e/mocks/handlers/sessions.ts's stateful fixtures — mockSession/Pickleball,
 * mockGroupSession/Badminton, mockOwnedGroupSession/Pickleball). The old
 * spots-left/full CTA is gone — every card shows a status badge + a
 * "View details" CTA, which now has a real destination (step 6, rewritten).
 * CLIENT-SESSION-9 update: "View details" opens SessionDetailModal in place instead of
 * navigating to /matches (step 6, rewritten again) — and each card may render a second
 * participation-action button (Join/Accept/Cancel/Leave) next to it, so `matchCtas` below is
 * scoped to "view details" specifically, not every button on the rail card.
 *
 * SPORT-3 update: the real sport catalog shrank to exactly 2 active sports
 * (Badminton, Pickleball — sport-impl's A6). mockUser now holds a profile
 * for both (every available sport), not a "3-sport cap" that's no longer
 * representable at all with only 2 real sports. Step 2 now clicks the
 * "Pickleball" pill (was "Basketball") — the feed narrows to 1 post
 * (unchanged split: 2 posts Badminton, 1 Pickleball), but matches now narrow
 * to 2, not 1 (mockSession AND mockOwnedGroupSession are both Pickleball —
 * with only 2 real sports, the old "one session per sport" 1:1:1 split isn't
 * representable either; Badminton keeps exactly 1 (mockGroupSession)).
 *
 * AUTH-4 update: Home Feed now sits behind ProtectedRoute — step 1 seeds an
 * authenticated session (MSW-backed) instead of a bare page.goto('/').
 *
 * FEED-1 update: step 1 and step 4 now exercise the real feed/like MSW
 * handlers (previously mock-internal, per this file's own former note).
 * Step 8 is new — the delete menu FEED-1 added (no equivalent in the
 * original HF-11 spec, which predates PostCard having any ownership
 * concept).
 *
 * FEED-6 update: step 5 (hashtag click) now asserts the real destination — a
 * modal (`HashtagPostsModal`, user decision — no route) listing the real
 * MSW-backed posts tagged `fridayrun` (mockPost + mockGroupPost, both real
 * fixtures), reachable from both a post's inline tag and the trending card's
 * row. Trending now has exactly 1 row (the real `mockHashtag` fixture),
 * replacing the old mock array's 4 — step 1/2's trending-count assertions
 * are updated accordingly.
 *
 * FEED-7 update: step 1/2's broadcast-count assertions drop from 2 (the old
 * mock array) to 1 (the real `mockBroadcastPost`/`mockGroup` fixture pair) —
 * same reasoning as the FEED-6 trending-count update above. The fixture user
 * is only a `group_member` of `mockGroup`, not owner/admin, so the
 * composer's "Broadcast" toggle never renders in this journey — creating/
 * updating a broadcast isn't covered here (would need an owner/admin
 * fixture, a future ticket's concern if that flow needs its own e2e spec).
 */

test('Home Feed journey', async ({ page }) => {
  const upcoming = page.getByRole('region', { name: 'Upcoming matches' });
  const trending = page.getByRole('region', { name: 'Trending hashtags' });
  const broadcasts = page.getByRole('region', { name: 'Group broadcasts' });
  const matchCtas = upcoming.getByRole('button', { name: /view details/i });

  await test.step('1. load — shell, switcher, feed, and all three rail blocks render', async () => {
    await seedAuthenticatedSession(page);
    await expect(page.getByText('SportHub', { exact: true })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Primary' })).toBeVisible();
    await expect(page.getByRole('group', { name: 'Sport filter' })).toBeVisible();
    await expect(page.getByRole('article')).toHaveCount(3);
    await expect(matchCtas).toHaveCount(3);
    await expect(trending.getByRole('button')).toHaveCount(1);
    await expect(broadcasts.getByRole('button')).toHaveCount(1);
  });

  await test.step('2. pickleball pill — feed and matches filter; trending/broadcasts unchanged', async () => {
    await page.getByRole('button', { name: 'Pickleball', exact: true }).click();
    await expect(page.getByRole('article')).toHaveCount(1);
    await expect(page.getByRole('article')).toContainText('Priya Shah');
    await expect(matchCtas).toHaveCount(2);
    await expect(upcoming).toContainText('Sunday pickup run');
    await expect(trending.getByRole('button')).toHaveCount(1);
    await expect(broadcasts.getByRole('button')).toHaveCount(1);
  });

  await test.step('3. "All" — filters clear', async () => {
    await page.getByRole('button', { name: 'All', exact: true }).click();
    await expect(page.getByRole('article')).toHaveCount(3);
    await expect(matchCtas).toHaveCount(3);
  });

  await test.step('4. like toggle — fills and increments, reverts on second click', async () => {
    const like = page.getByRole('button', { name: 'Like' }).first();
    await expect(like).toContainText('3'); // Jordan Lee's own post, first in feed order
    await like.click();

    const unlike = page.getByRole('button', { name: 'Unlike' }).first();
    await expect(unlike).toHaveAttribute('aria-pressed', 'true');
    await expect(unlike).toContainText('4');
    await unlike.click();

    const reverted = page.getByRole('button', { name: 'Like' }).first();
    await expect(reverted).toHaveAttribute('aria-pressed', 'false');
    await expect(reverted).toContainText('3');
  });

  await test.step('5. hashtags — clicking opens a modal with the real filtered posts', async () => {
    const postTag = page.getByRole('article').first().getByRole('button', { name: '#fridayrun' });
    await expect(postTag).toBeEnabled();
    await postTag.click();

    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('heading', { name: '#fridayrun' })).toBeVisible();
    // mockPost + mockGroupPost are both tagged 'fridayrun'; mockBasketballPost isn't.
    await expect(dialog.getByRole('article')).toHaveCount(2);
    await dialog.getByRole('button', { name: 'Close' }).click();
    await expect(dialog).not.toBeVisible();

    // No navigation — the modal doesn't change the URL.
    await expect(page).toHaveURL('/');
    await expect(page.getByRole('article')).toHaveCount(3);

    // Same destination, reached from the trending card's row instead.
    const trendingTag = trending.getByRole('button', { name: /^#fridayrun/ });
    await expect(trendingTag).toBeEnabled();
    await trendingTag.click();
    await expect(dialog.getByRole('heading', { name: '#fridayrun' })).toBeVisible();
    await expect(dialog.getByRole('article')).toHaveCount(2);
    await page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible();
  });

  await test.step('6. match CTA — "View details" opens SessionDetailModal in place, no navigation (CLIENT-SESSION-9)', async () => {
    await matchCtas.first().click();
    await expect(page.getByRole('dialog')).toBeVisible();
    // No navigation — the modal opens over Home Feed, not the Matches page.
    await expect(page).toHaveURL('/');
    await page.getByRole('dialog').getByRole('button', { name: 'Close' }).click();
    await expect(page.getByRole('dialog')).not.toBeVisible();
  });

  await test.step('7. "Add sport" — every catalog sport already held (real SPORT-1/SPORT-3 data) renders aria-disabled (HF-2 behavior)', async () => {
    const addSport = page.getByRole('button', { name: 'Add sport' });
    await expect(addSport).toBeVisible();
    await expect(addSport).toHaveAttribute('aria-disabled', 'true');
  });

  await test.step('8. delete — the "..." menu only appears on the caller\'s own posts, and removes them', async () => {
    const firstArticle = page.getByRole('article').first();
    // Jordan Lee's own post (first in feed order) has the menu; Priya Shah's does not.
    await expect(firstArticle.getByRole('button', { name: 'Post options' })).toBeVisible();
    const lastArticle = page.getByRole('article').last();
    await expect(lastArticle.getByRole('button', { name: 'Post options' })).toHaveCount(0);

    await firstArticle.getByRole('button', { name: 'Post options' }).click();
    await page.getByRole('menuitem', { name: 'Delete post' }).click();
    await expect(page.getByRole('article')).toHaveCount(2);
  });
});
