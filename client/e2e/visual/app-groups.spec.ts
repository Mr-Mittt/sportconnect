import { seedAuthenticatedSession } from '../mocks/fixtures.ts';
import { expect, test } from '../mocks/test.ts';

/*
 * GRP-10: full-page visual regression of the REAL GroupsPage (`#groups-view`
 * in the design reference), matching the shape HF-10a/b already established
 * for Home Feed (app-home-feed.spec.ts) — full-page screenshots (not
 * dialog-scoped, unlike the post modal's app-post-modal.spec.ts — this is a
 * page, not a modal), 3 breakpoints, diffed against committed baselines,
 * regenerated on Linux via the client-ci workflow's update-baselines
 * dispatch. Closes a gap GRP-1 explicitly flagged and never followed up on.
 *
 * 6 states cover every major surface GRP-1..GRP-9 shipped:
 *  - discovery: GroupDiscoveryPanel, no group selected (default landing).
 *  - owner-posts: mockOwnedGroup ("Weekend Tennis Ladder", sportId 3 —
 *    Pickleball; the group's own display name is an unrelated legacy string,
 *    see fixtures.ts's own comment), Posts tab, Broadcast toggle clicked on
 *    to capture the owner-exclusive UI FEED-7 added. No fixture ties a post
 *    to this group, so the feed area legitimately shows its empty state —
 *    same "real state, not avoided" precedent as Home Feed's own 'empty'
 *    baseline.
 *  - member-posts: mockGroup ("Friday Night Football", sportId 1 —
 *    Badminton), Posts tab — real seeded content (mockGroupPost), no
 *    Broadcast toggle (plain member).
 *  - members-tab: mockOwnedGroup, Members tab — all 5 status-grouped
 *    sections with real fixture data (GRP-3/GRP-7/GRP-8).
 *  - settings-tab: mockOwnedGroup, Settings tab (GRP-2).
 *  - chat-tab: mockGroup, Chat tab. GroupChatTab is wired to the real chat
 *    service (CHAT-8), not the local-state mock GRP-1 originally shipped it
 *    as (a stale claim in this ticket's own doc, corrected there as a
 *    Delta) — one message is sent live through the real composer (MSW-
 *    persisted, same "seed live through the real UI" pattern as FEED-11's
 *    reply) for a populated bubble instead of screenshotting an empty
 *    thread.
 *
 * Clock frozen at the same instant as every other visual-regression spec in
 * this suite, purely for consistency — this page renders no message
 * timestamps (GroupChatTabView) and no clock-sensitive relative time in any
 * of these 6 states, but freezing costs nothing and matches precedent.
 *
 * NOTE: baselines are OS-specific (font rendering) — regenerated on Linux
 * via the client-ci workflow's update-baselines input, same as every other
 * spec in this directory.
 */

const FROZEN_TIME = new Date('2026-07-07T19:00:00');
const breakpoints = [375, 768, 1280] as const;

async function openGroup(page: import('@playwright/test').Page, groupName: string) {
  const groupSwitcher = page.getByRole('group', { name: 'Group filter' });
  await groupSwitcher.getByRole('button', { name: new RegExp(groupName) }).click();
}

/**
 * Waits out every `Skeleton` (`.animate-pulse`, shared by GroupSettingsTab/
 * GroupMembersTab/GroupDiscoveryPanel and the right rail's TrendingHashtags/
 * GroupBroadcasts) and "Loading…" text placeholder still on screen. Found
 * necessary live: this page's several independent queries (settings, group
 * info, members, approval queue, sent invitations, hashtags, broadcasts)
 * don't all resolve by the time a single landmark assertion passes, and the
 * late layout shift as each one settles in made `toHaveScreenshot`'s own
 * stability check fail ("failed to take two consecutive stable
 * screenshots") — same root cause on every affected state, not one flaky
 * exception.
 */
async function waitForContentSettled(page: import('@playwright/test').Page) {
  await expect(page.getByText('Loading…')).toHaveCount(0);
  await expect(page.locator('.animate-pulse')).toHaveCount(0);
}

for (const width of breakpoints) {
  test(`groups — discovery @ ${width}px`, async ({ page }) => {
    await page.clock.setFixedTime(FROZEN_TIME);
    await page.setViewportSize({ width, height: 900 });
    await seedAuthenticatedSession(page, '/groups');

    await expect(page.getByLabel('Group name or invite code')).toBeVisible();
    await waitForContentSettled(page);
    await page.evaluate('document.fonts.ready');

    await expect(page).toHaveScreenshot(`groups-discovery-${width}.png`, { fullPage: true });
  });

  test(`groups — owner-posts (Broadcast toggle on) @ ${width}px`, async ({ page }) => {
    await page.clock.setFixedTime(FROZEN_TIME);
    await page.setViewportSize({ width, height: 900 });
    await seedAuthenticatedSession(page, '/groups');

    await openGroup(page, 'Weekend Tennis Ladder');
    await expect(page.getByRole('tab', { name: 'Posts', selected: true })).toBeVisible();
    const broadcastToggle = page.getByRole('button', { name: 'Broadcast' });
    await expect(broadcastToggle).toBeVisible();
    await broadcastToggle.click();
    await expect(broadcastToggle).toHaveAttribute('aria-pressed', 'true');
    await waitForContentSettled(page);
    await page.evaluate('document.fonts.ready');

    await expect(page).toHaveScreenshot(`groups-owner-posts-${width}.png`, { fullPage: true });
  });

  test(`groups — member-posts @ ${width}px`, async ({ page }) => {
    await page.clock.setFixedTime(FROZEN_TIME);
    await page.setViewportSize({ width, height: 900 });
    await seedAuthenticatedSession(page, '/groups');

    await openGroup(page, 'Friday Night Football');
    await expect(page.getByRole('tab', { name: 'Posts', selected: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Broadcast' })).toHaveCount(0);
    await expect(page.getByRole('article').first()).toBeVisible();
    await waitForContentSettled(page);
    await page.evaluate('document.fonts.ready');

    await expect(page).toHaveScreenshot(`groups-member-posts-${width}.png`, { fullPage: true });
  });

  test(`groups — members-tab @ ${width}px`, async ({ page }) => {
    await page.clock.setFixedTime(FROZEN_TIME);
    await page.setViewportSize({ width, height: 900 });
    await seedAuthenticatedSession(page, '/groups');

    await openGroup(page, 'Weekend Tennis Ladder');
    await page.getByRole('tab', { name: 'Members' }).click();
    await expect(page.getByRole('region', { name: 'Group administrator' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Waiting for group approve' })).toBeVisible();
    await waitForContentSettled(page);
    await page.evaluate('document.fonts.ready');

    await expect(page).toHaveScreenshot(`groups-members-tab-${width}.png`, { fullPage: true });
  });

  test(`groups — settings-tab @ ${width}px`, async ({ page }) => {
    await page.clock.setFixedTime(FROZEN_TIME);
    await page.setViewportSize({ width, height: 900 });
    await seedAuthenticatedSession(page, '/groups');

    await openGroup(page, 'Weekend Tennis Ladder');
    await page.getByRole('tab', { name: 'Settings' }).click();
    await expect(page.getByText('Privacy')).toBeVisible();
    await waitForContentSettled(page);
    await page.evaluate('document.fonts.ready');

    await expect(page).toHaveScreenshot(`groups-settings-tab-${width}.png`, { fullPage: true });
  });

  test(`groups — chat-tab (one message sent) @ ${width}px`, async ({ page }) => {
    await page.clock.setFixedTime(FROZEN_TIME);
    await page.setViewportSize({ width, height: 900 });
    await seedAuthenticatedSession(page, '/groups');

    await openGroup(page, 'Friday Night Football');
    await page.getByRole('tab', { name: 'Chat' }).click();
    const composer = page.getByLabel('Message the group', { exact: true });
    await expect(composer).toBeVisible();
    await composer.fill('See everyone Saturday!');
    await composer.press('Enter');
    await expect(page.getByText('See everyone Saturday!')).toBeVisible();
    await waitForContentSettled(page);
    await page.evaluate('document.fonts.ready');

    await expect(page).toHaveScreenshot(`groups-chat-tab-${width}.png`, { fullPage: true });
  });
}
