import { seedAuthenticatedSession } from '../mocks/fixtures.ts';
import { expect, test } from '../mocks/test.ts';

/*
 * PROFILE-7: full-page visual regression of the real ProfilePage
 * (`#profile-view` in the design reference), matching the shape GRP-10/
 * app-groups.spec.ts already established — full-page screenshots (not
 * dialog-scoped, except the Edit Profile modal state, same reasoning
 * CLIENT-SESSION-12/app-post-modal.spec.ts use for a dialog), 3 breakpoints,
 * diffed against committed baselines, Linux-rendered via the client-ci
 * workflow's update-baselines dispatch.
 *
 * 4 states, curated (not exhaustive — many individual field/prop states are
 * already human-reviewed in Storybook, same "curated set" precedent
 * CLIENT-SESSION-12 used):
 *  - posts: default landing tab, real seeded content (mockPost + mockGroupPost,
 *    both mockUser's own, both Badminton — mockUser's first sport profile,
 *    matching this page's own "default to first sport profile" behavior).
 *  - memories: ComingSoonPage placeholder (no backend concept exists yet).
 *  - settings: the per-sport profile editor (PROFILE-4/SPORT-2), clean
 *    (non-dirty) state — Save is disabled until dirty, so no PUT mutation
 *    handler is needed for this baseline.
 *  - edit-profile-modal: PROFILE-5's Edit Profile modal, opened from
 *    ProfileHeader — dialog-scoped, no PUT mutation handler needed either
 *    (never submitted for this baseline).
 *
 * PROFILE-7 also closes a real MSW gap found at pickup: GET /api/posts/mine
 * didn't exist at all, and the shared GET /api/users/:userId handler only
 * ever returned the narrow FriendUser shape (missing firstName/lastName/
 * username/city/country/etc. that useMyProfile/ProfileHeader/
 * EditProfileModal need for the caller's own profile) — see feed.ts's and
 * friends.ts's own comments on those two handlers.
 *
 * Clock frozen at the same instant as every other visual-regression spec in
 * this suite, for consistency — this page renders no clock-sensitive
 * relative time in any of these 4 states.
 *
 * NOTE: baselines are OS-specific (font rendering) — regenerated on Linux
 * via the client-ci workflow's update-baselines input, same as every other
 * spec in this directory.
 */

const FROZEN_TIME = new Date('2026-07-07T19:00:00');
const breakpoints = [375, 768, 1280] as const;

for (const width of breakpoints) {
  test(`profile — posts @ ${width}px`, async ({ page }) => {
    await page.clock.setFixedTime(FROZEN_TIME);
    await page.setViewportSize({ width, height: 900 });
    await seedAuthenticatedSession(page, '/profile');

    await expect(page.getByRole('tab', { name: 'Posts', selected: true })).toBeVisible();
    await expect(page.getByRole('article').first()).toBeVisible();
    await page.evaluate('document.fonts.ready');

    await expect(page).toHaveScreenshot(`profile-posts-${width}.png`, { fullPage: true });
  });

  test(`profile — memories @ ${width}px`, async ({ page }) => {
    await page.clock.setFixedTime(FROZEN_TIME);
    await page.setViewportSize({ width, height: 900 });
    await seedAuthenticatedSession(page, '/profile');

    await page.getByRole('tab', { name: 'Memories' }).click();
    await expect(page.getByRole('heading', { name: 'Memories' })).toBeVisible();
    await page.evaluate('document.fonts.ready');

    await expect(page).toHaveScreenshot(`profile-memories-${width}.png`, { fullPage: true });
  });

  test(`profile — settings @ ${width}px`, async ({ page }) => {
    await page.clock.setFixedTime(FROZEN_TIME);
    await page.setViewportSize({ width, height: 900 });
    await seedAuthenticatedSession(page, '/profile');

    await page.getByRole('tab', { name: 'Settings' }).click();
    await expect(page.getByLabel('Skill level')).toBeVisible();
    await page.evaluate('document.fonts.ready');

    await expect(page).toHaveScreenshot(`profile-settings-${width}.png`, { fullPage: true });
  });

  test(`profile — edit profile modal @ ${width}px`, async ({ page }) => {
    await page.clock.setFixedTime(FROZEN_TIME);
    await page.setViewportSize({ width, height: 900 });
    await seedAuthenticatedSession(page, '/profile');

    await page.getByRole('button', { name: 'Edit profile' }).click();
    const dialog = page.getByRole('dialog', { name: 'Edit profile' });
    await expect(dialog.getByLabel('First name')).toBeVisible();
    // CLIENT-SESSION-12: blur the autofocused field first — an open text
    // input's blinking caret is a real, reproducible flakiness source for
    // this kind of dialog-scoped screenshot.
    await page.evaluate('document.activeElement && document.activeElement.blur()');
    await page.evaluate('document.fonts.ready');

    await expect(dialog).toHaveScreenshot(`profile-edit-profile-modal-${width}.png`);
  });
}
