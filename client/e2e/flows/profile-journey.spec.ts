import { seedAuthenticatedSession } from '../mocks/fixtures.ts';
import { expect, test } from '../mocks/test.ts';

/*
 * PROFILE-8: the `/profile` page's E2E journey (PROFILE_PAGE_DESIGN.md /
 * this ticket's own "What ships" script) — header/bio, SportSwitcher,
 * posting from the composer, the comment modal, Settings tab save (both a
 * base field and a `SportAttributesFields` attribute), Edit Profile save,
 * and the Memories placeholder. Network mocked via MSW (`seedAuthenticatedSession`),
 * same shape as every other `*-journey.spec.ts` in this directory.
 *
 * This is the first ticket to exercise two mutation handlers that didn't
 * exist before this ticket (PROFILE-7 only ever needed the GET side of both):
 * `PUT /api/sports/profiles/:profileId` (e2e/mocks/handlers/sport.ts) and
 * `PUT /api/users/:userId/profile` (e2e/mocks/handlers/friends.ts, now
 * backed by a session-scoped `myProfileState` instead of the fixed
 * `mockMyProfile` constant PROFILE-7 introduced).
 *
 * Fixtures: mockUser ("Jordan Lee") holds two sport profiles — Badminton
 * (sportId 1, skillLevel 'intermediate', the page's default active pill,
 * the one sport with a real attribute schema: `racketBrand`/"Racket brand",
 * STRING) and Pickleball (sportId 3, skillLevel 'beginner', no attribute
 * schema — sport.ts's own fixture comment). mockPost/mockGroupPost are both
 * Jordan Lee's own Badminton posts (via GET /api/posts/mine, PROFILE-7).
 * mockMyProfile (e2e/mocks/fixtures.ts) is Jordan Lee's own full profile row.
 */

test('Profile journey', async ({ page }) => {
  await test.step('1. load — header/bio render, Posts tab is the default, both own posts show', async () => {
    await seedAuthenticatedSession(page, '/profile');
    await expect(page.getByRole('heading', { name: 'Profile' })).toBeVisible();
    // .first() — "Jordan Lee" also appears as the author name on both own posts below.
    await expect(page.getByText('Jordan Lee').first()).toBeVisible();
    await expect(page.getByText('@jordanlee · Riverside')).toBeVisible();
    await expect(
      page.getByText('Weekend warrior. Badminton on Saturdays, pickleball whenever the courts are free.'),
    ).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Posts', selected: true })).toBeVisible();
    await expect(page.getByRole('article')).toHaveCount(2);
  });

  await test.step('2. SportSwitcher — Pickleball has no own posts (empty state), switching back to Badminton restores them', async () => {
    await page.getByRole('button', { name: 'Pickleball', exact: true }).click();
    await expect(page.getByText('No posts yet for this sport.')).toBeVisible();
    await expect(page.getByRole('article')).toHaveCount(0);

    await page.getByRole('button', { name: 'Badminton', exact: true }).click();
    await expect(page.getByRole('article')).toHaveCount(2);
  });

  await test.step('3. post from the composer — appears first in the list, tagged with the active sport', async () => {
    const composer = page.getByLabel('Create a post');
    await composer.fill('First post from the profile page!');
    await page.getByRole('button', { name: 'Post', exact: true }).click();

    await expect(page.getByRole('article')).toHaveCount(3);
    await expect(page.getByRole('article').first()).toContainText('First post from the profile page!');
  });

  await test.step('4. comment modal — opens empty, adding a comment shows it and bumps the count', async () => {
    const newPost = page.getByRole('article').first();
    await newPost.getByRole('button', { name: 'View comments' }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText('No comments yet. Be the first to comment!')).toBeVisible();

    await dialog.getByLabel('Add a comment').fill('Nice first post!');
    await dialog.getByRole('button', { name: 'Post' }).first().click();
    await expect(dialog.getByText('Nice first post!')).toBeVisible();

    await dialog.getByRole('button', { name: 'Close' }).click();
    await expect(dialog).not.toBeVisible();
    await expect(newPost.getByRole('button', { name: 'View comments' })).toContainText('1');
  });

  await test.step('5. Settings tab — editing skillLevel + a SportAttributesFields attribute persists', async () => {
    await page.getByRole('tab', { name: 'Settings' }).click();
    await expect(page.getByLabel('Skill level')).toHaveValue('intermediate');

    const saveButton = page.getByRole('button', { name: 'Save changes' });
    await expect(saveButton).toBeDisabled();

    await page.getByLabel('Skill level').selectOption('advanced');
    await page.getByLabel('Racket brand').fill('Yonex');
    await expect(saveButton).toBeEnabled();
    await saveButton.click();

    await expect(saveButton).toBeDisabled();
    await expect(page.getByLabel('Skill level')).toHaveValue('advanced');
    await expect(page.getByLabel('Racket brand')).toHaveValue('Yonex');
  });

  await test.step('6. Edit Profile modal — changing the bio saves and updates the header', async () => {
    await page.getByRole('button', { name: 'Edit profile' }).click();
    const dialog = page.getByRole('dialog', { name: 'Edit profile' });
    await expect(dialog.getByLabel('First name')).toHaveValue('Jordan');

    const bioField = dialog.getByLabel('Bio');
    await bioField.fill('Now coaching weekend badminton clinics too.');
    await dialog.getByRole('button', { name: 'Save changes' }).click();

    await expect(dialog).not.toBeVisible();
    await expect(page.getByText('Now coaching weekend badminton clinics too.')).toBeVisible();
  });

  await test.step('7. Memories tab — renders the ComingSoonPage placeholder', async () => {
    await page.getByRole('tab', { name: 'Memories' }).click();
    await expect(page.getByRole('heading', { name: 'Memories' })).toBeVisible();
    await expect(page.getByText('Coming soon.')).toBeVisible();
  });
});
