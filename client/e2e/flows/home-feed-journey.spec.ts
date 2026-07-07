import { expect, test } from '@playwright/test';

/*
 * HF-11: the 7-step Home Feed journey (HF epic § HF-11), fully mock-driven —
 * no MSW, no network. Auto-waiting assertions only; no sleeps.
 *
 * Premise corrections vs the epic's literal steps (user-approved; see the
 * backlog entry's deltas): hashtag and match-CTA callbacks are deliberate
 * no-ops until FEED-6/FEED-1 land, so steps 5–6 assert reachability and
 * distinct states rather than a fabricated side effect; the mock user is AT
 * the 3-sport cap, so step 7 asserts HF-2's at-cap behavior (aria-disabled).
 *
 * MSW follow-ups once Phases 5–6 de-mock the hooks (per the epic, recorded
 * here so they aren't lost): step 1 needs handlers for feed/trending/
 * broadcasts/sport-profiles; step 4 for the like mutation; step 5 for
 * hashtag-filtered posts; step 7's fixture gains an under-cap user.
 */

test('Home Feed journey', async ({ page }) => {
  const upcoming = page.getByRole('region', { name: 'Upcoming matches' });
  const trending = page.getByRole('region', { name: 'Trending hashtags' });
  const broadcasts = page.getByRole('region', { name: 'Group broadcasts' });
  const matchCtas = upcoming.getByRole('button', { name: /join|view details/ });

  await test.step('1. load — shell, switcher, feed, and all three rail blocks render', async () => {
    await page.goto('/');
    await expect(page.getByText('SportHub')).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Primary' })).toBeVisible();
    await expect(page.getByRole('group', { name: 'Sport filter' })).toBeVisible();
    await expect(page.getByRole('article')).toHaveCount(4);
    await expect(matchCtas).toHaveCount(3);
    await expect(trending.getByRole('button')).toHaveCount(4);
    await expect(broadcasts.getByRole('button')).toHaveCount(2);
  });

  await test.step('2. basketball pill — feed and matches filter; trending/broadcasts unchanged', async () => {
    await page.getByRole('button', { name: 'Basketball', exact: true }).click();
    await expect(page.getByRole('article')).toHaveCount(1);
    await expect(page.getByRole('article')).toContainText('Priya Shah');
    await expect(matchCtas).toHaveCount(1);
    await expect(upcoming).toContainText('Sunday pickup run');
    await expect(trending.getByRole('button')).toHaveCount(4);
    await expect(broadcasts.getByRole('button')).toHaveCount(2);
  });

  await test.step('3. "All" — filters clear', async () => {
    await page.getByRole('button', { name: 'All', exact: true }).click();
    await expect(page.getByRole('article')).toHaveCount(4);
    await expect(matchCtas).toHaveCount(3);
  });

  await test.step('4. like toggle — fills and increments, reverts on second click', async () => {
    const like = page.getByRole('button', { name: 'Like' }).first();
    await expect(like).toContainText('14'); // Marcus Lee's post, first in mock order
    await like.click();

    const unlike = page.getByRole('button', { name: 'Unlike' }).first();
    await expect(unlike).toHaveAttribute('aria-pressed', 'true');
    await expect(unlike).toContainText('15');
    await unlike.click();

    const reverted = page.getByRole('button', { name: 'Like' }).first();
    await expect(reverted).toHaveAttribute('aria-pressed', 'false');
    await expect(reverted).toContainText('14');
  });

  await test.step('5. hashtags — clickable in feed and trending, page stays intact (no-op today)', async () => {
    const postTag = page.getByRole('article').first().getByRole('button', { name: '#fridayrun' });
    await expect(postTag).toBeEnabled();
    await postTag.click();

    const trendingTag = trending.getByRole('button', { name: /#tournament/ });
    await expect(trendingTag).toBeEnabled();
    await trendingTag.click();

    // No destination exists yet — the click must neither navigate nor break the page
    await expect(page).toHaveURL('/');
    await expect(page.getByRole('article')).toHaveCount(4);
  });

  await test.step('6. match CTAs — open and full variants both reachable and distinct', async () => {
    const openCta = upcoming.getByRole('button', { name: /2 spots left, join/ });
    const fullCta = upcoming.getByRole('button', { name: /Full, view details/ });
    await expect(openCta).toBeEnabled();
    await expect(fullCta).toBeEnabled();
    await openCta.click();
    await fullCta.click();
    await expect(page).toHaveURL('/'); // no destination screen yet
  });

  await test.step('7. "Add sport" — at the 3-sport cap it renders aria-disabled (HF-2 behavior)', async () => {
    const addSport = page.getByRole('button', { name: 'Add sport' });
    await expect(addSport).toBeVisible();
    await expect(addSport).toHaveAttribute('aria-disabled', 'true');
  });
});
