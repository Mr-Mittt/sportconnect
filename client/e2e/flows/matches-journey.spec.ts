import {
  mockDiscoverableSession,
  mockFriend,
  mockLocation,
  seedAuthenticatedSession,
  seedSoftDeletedSportProfileOnNextLoad,
} from '../mocks/fixtures.ts';
import { expect, test } from '../mocks/test.ts';

/*
 * CLIENT-SESSION-1: the Matches page's create/list/join/leave/cancel journey
 * (client/docs/BACKLOG_MVP.md § CLIENT-SESSION-1), mirroring
 * feed-groups-journey.spec.ts's structure (one `test()`, sequential
 * `test.step()`s).
 *
 * Fixtures (e2e/mocks/fixtures.ts): `mockSession` — a standalone session
 * mockUser created, not yet joined by them (participantCount 0), reused
 * across the join/leave/cancel steps. `mockGroupSession` — group-linked to
 * `mockGroup` (mockUser is a group_member, not owner/admin, and didn't
 * create it), proving the Cancel button stays hidden for a session the
 * caller can only join/leave. `mockLocation` (Pickleball, sportId 3) backs
 * the create-session step's "search an existing location" flow — no
 * paste-a-link/resolve coverage here (that's LocationPicker's own
 * component/Storybook tests; e2e/mocks/handlers/locations.ts's
 * resolve-maps-url handler exists but isn't exercised by this spec).
 *
 * CLIENT-SESSION-4: step 6 also exercises "Invite your friend" (`mockFriend`)
 * and "Auto approve join request" in the create form. Step 7 is the
 * approval-queue journey against `mockOwnedGroupSession` ("Ladder night",
 * mockUser is group_owner there — `canManage` true) — `mockSessionJoinRequest`/
 * `mockSecondSessionJoinRequest` are pre-seeded REQUESTED rows (same
 * "pre-seed the other person's row" precedent as group-invitations.spec.ts's
 * `mockGroupJoinRequest`, since this mock server has no second live
 * authenticated identity to actually request-join as).
 *
 * CLIENT-SESSION-6: the page split into a Discover grid (`region` "Discover
 * sessions") and a collapsible "My sessions" panel (`region` "My sessions").
 * Steps 1-8 above all target sessions that render inside "My sessions"
 * (mockUser created or belongs to the group) and are unaffected by the
 * split — `page.getByText`/`getByRole('button', {name: ...})` finds them
 * regardless of which panel they're in. Step 9 covers what's actually new:
 * `mockDiscoverableSession` ("Weekend 5-a-side", created by someone else,
 * Badminton — a sport mockUser holds an active profile for) starts out visible
 * only in Discover; joining it moves it into "My sessions" without a
 * reload (both queries share the `sessionKeys.all` invalidation root).
 * Step 10 covers the search filter and the panel collapse toggle.
 *
 * CLIENT-SESSION-8: steps 3b/3c (inserted right after step 3, reusing the same "Sunday pickup
 * run" session before step 4 cancels it). 3b covers the Discussion section — reading the seeded
 * comment (`e2e/mocks/handlers/sessions.ts`'s `commentsState`) and posting a new one via
 * `POST /api/sessions/{sessionId}/comments`. 3c covers the heart button — like then unlike via
 * `POST`/`DELETE /api/sessions/{sessionId}/like`, asserting the count round-trips 0 -> 1 -> 0.
 */

test('Matches journey', async ({ page }) => {
  await seedAuthenticatedSession(page, '/matches');

  await test.step('1. load — both my sessions and a discoverable session render', async () => {
    await expect(page.getByText('Sunday pickup run')).toBeVisible();
    await expect(page.getByText('Friday 5-a-side')).toBeVisible();
    await expect(
      page.getByRole('region', { name: 'Discover sessions' }).getByText('Weekend 5-a-side'),
    ).toBeVisible();
  });

  await test.step('2. sport filter narrows the list, "All" restores it', async () => {
    await page.getByRole('button', { name: 'Pickleball' }).click();
    await expect(page.getByText('Sunday pickup run')).toBeVisible();
    await expect(page.getByText('Friday 5-a-side')).not.toBeVisible();

    await page.getByRole('button', { name: 'All', exact: true }).click();
    await expect(page.getByText('Friday 5-a-side')).toBeVisible();
  });

  await test.step('3. join the standalone session (creator never sees Leave)', async () => {
    await page.getByRole('button', { name: /Sunday pickup run — View details/ }).click();
    const dialog = page.getByRole('dialog', { name: 'Sunday pickup run' });
    // mockSession has a real chosen capacity (10, CLIENT-SESSION-3) — not the 9999 "uncapped"
    // sentinel — so Players shows "N/10", not the plain "N" the sentinel would render.
    // CLIENT-SESSION-10 renamed the section "Participants" -> "Players".
    await expect(dialog.getByText('Players (0/10)')).toBeVisible();

    await dialog.getByRole('button', { name: 'Join' }).click();
    await expect(dialog.getByText('Players (1/10)')).toBeVisible();
    await expect(dialog.getByText('Jordan Lee', { exact: true })).toBeVisible();
    // mockSession is created by the test user themselves — once JOINED, the creator doesn't get
    // the plain participant Leave action (CLIENT-SESSION-10 post-ship), so neither Join nor Leave
    // shows here. The Leave mutation itself is still exercised e2e on a session the test user
    // didn't create — step 5b, mockGroupSession's card.
    await expect(dialog.getByRole('button', { name: 'Leave' })).not.toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Join' })).not.toBeVisible();

    await dialog.getByRole('button', { name: 'Close' }).click();
  });

  await test.step('3b. Discussion section — reads the seeded comment, posts a new one (CLIENT-SESSION-8)', async () => {
    await page.getByRole('button', { name: /Sunday pickup run — View details/ }).click();
    const dialog = page.getByRole('dialog', { name: 'Sunday pickup run' });
    const discussion = dialog.getByRole('region', { name: 'Discussion' });

    await expect(discussion.getByText('What time are we meeting at the courts?')).toBeVisible();

    // CLIENT-SESSION-10 moved the composer out of the Discussion region into the dialog's pinned
    // footer (SessionCommentComposer) — scoped from the dialog, not the region, from here on.
    await dialog.getByRole('textbox', { name: 'Add a comment' }).fill('7pm works for me!');
    await dialog.getByRole('button', { name: 'Post comment' }).click();
    await expect(discussion.getByText('7pm works for me!')).toBeVisible();

    await dialog.getByRole('button', { name: 'Close' }).click();
  });

  await test.step('3c. heart button likes/unlikes the session (CLIENT-SESSION-8)', async () => {
    await page.getByRole('button', { name: /Sunday pickup run — View details/ }).click();
    const dialog = page.getByRole('dialog', { name: 'Sunday pickup run' });

    const likeButton = dialog.getByRole('button', { name: 'Like', exact: true });
    await expect(likeButton).toHaveText('0');
    await likeButton.click();

    const unlikeButton = dialog.getByRole('button', { name: 'Unlike', exact: true });
    await expect(unlikeButton).toHaveText('1');
    await unlikeButton.click();
    await expect(dialog.getByRole('button', { name: 'Like', exact: true })).toHaveText('0');

    await dialog.getByRole('button', { name: 'Close' }).click();
  });

  // Step 4 used to cancel the standalone session here (Cancel session -> reason -> Confirm
  // cancel -> Cancelled badge). CLIENT-SESSION-10 post-ship: the Cancel session button was
  // removed from SessionDetailModal entirely (user decision) — there is no longer any UI path to
  // cancel a session, so that flow is gone rather than reworked. Numbering keeps the gap (jumps
  // 3c -> 5) rather than renumbering every later step + docs/E2E_OVERVIEW.md's table for a purely
  // cosmetic concern.

  await test.step('5. a group session the caller only belongs to — Join/Leave still work', async () => {
    await page.getByRole('button', { name: /Friday 5-a-side — View details/ }).click();
    const dialog = page.getByRole('dialog', { name: 'Friday 5-a-side' });

    await expect(dialog.getByRole('button', { name: 'Join' })).toBeVisible();
    await dialog.getByRole('button', { name: 'Close' }).click();
  });

  await test.step('5b. Join and Leave directly from the session card, no dialog required (CLIENT-SESSION-9)', async () => {
    await page.getByRole('button', { name: /Friday 5-a-side — Join/ }).click();
    await expect(page.getByRole('button', { name: /Friday 5-a-side — Leave/ })).toBeVisible();

    await page.getByRole('button', { name: /Friday 5-a-side — Leave/ }).click();
    await expect(page.getByRole('button', { name: /Friday 5-a-side — Join/ })).toBeVisible();
  });

  await test.step('6. create a standalone session, searching an existing location', async () => {
    await page.getByRole('button', { name: 'Create session' }).click();
    const createDialog = page.getByRole('dialog', { name: 'Create your session' });
    await createDialog.getByLabel(/^Sport/).selectOption('pickleball');

    // CLIENT-SESSION-5: "Choose location" is now a favorites dropdown trigger, not a direct
    // LocationPicker opener — "Choose a location…" is its trailing item.
    await createDialog.getByRole('button', { name: 'Choose location' }).click();
    await page.getByRole('menuitem', { name: 'Choose a location…' }).click();
    const locationDialog = page.getByRole('dialog', { name: 'Choose a location' });
    await locationDialog.getByLabel('Search locations').fill('Riverside');
    await locationDialog.getByRole('button', { name: 'Search' }).click();
    await locationDialog.getByText(mockLocation.name, { exact: true }).click();

    await expect(createDialog.getByText(mockLocation.name)).toBeVisible();
    // Starts at (Date/Hour/Minute) is left on its own default (Today/one-hour-from-now/:00) —
    // CLIENT-SESSION-2 pre-fills it on open, so there's nothing to fill in here anymore.
    await createDialog.getByLabel(/^Session title/).fill('New pickup game');
    await createDialog.getByLabel(/^Duration in minutes/).fill('90');
    // Open slot is required (CLIENT-SESSION-3); Fee is left on its default "Free" checkbox state.
    await createDialog.getByLabel(/^Open slot/).fill('10');

    // CLIENT-SESSION-4: invite a friend (dismissible badge) and check auto-approve (reveals the
    // inline warning, no separate confirm step).
    await createDialog.getByLabel('Search friends to invite').fill(mockFriend.fullName);
    await createDialog.getByRole('button', { name: new RegExp(mockFriend.fullName) }).click();
    await expect(createDialog.getByText(mockFriend.fullName, { exact: true })).toBeVisible();
    const autoApproveCheckbox = createDialog.getByRole('checkbox', { name: 'Auto approve join request' });
    await autoApproveCheckbox.check();
    await expect(createDialog.getByText('Everyone can join without your review.')).toBeVisible();

    await createDialog.getByRole('button', { name: 'Create session' }).click();

    await expect(createDialog).not.toBeVisible();
    await expect(page.getByText('New pickup game')).toBeVisible();
  });

  await test.step('7. approval queue: approve one requester, reject the other', async () => {
    await page.getByRole('button', { name: /Ladder night — View details/ }).click();
    const dialog = page.getByRole('dialog', { name: 'Ladder night' });
    const approvalSection = dialog.getByRole('region', { name: 'Waiting for approval' });

    await expect(approvalSection.getByText('Waiting for approval (2)')).toBeVisible();
    await expect(approvalSection.getByText('Alex Chen')).toBeVisible();
    await expect(approvalSection.getByText('Morgan Diaz')).toBeVisible();

    await approvalSection
      .getByText('Alex Chen')
      .locator('xpath=ancestor::div[contains(@class, "justify-between")][1]')
      .getByRole('button', { name: 'Approve' })
      .click();
    await expect(approvalSection.getByText('Alex Chen')).not.toBeVisible();
    await expect(dialog.getByText('Alex Chen', { exact: true })).toBeVisible(); // now a real participant

    const morganRow = approvalSection
      .getByText('Morgan Diaz')
      .locator('xpath=ancestor::div[contains(@class, "justify-between")][1]');
    await morganRow.getByRole('button', { name: 'Reject' }).click();
    await dialog.getByLabel('Reject reason for Morgan Diaz').fill('Ladder is full for this cycle.');
    await dialog.getByRole('button', { name: 'Confirm reject' }).click();

    await expect(approvalSection).not.toBeVisible();
    await dialog.getByRole('button', { name: 'Close' }).click();
  });

  await test.step('8. favorite a location in LocationPicker, then pick it from the favorites dropdown', async () => {
    await page.getByRole('button', { name: 'Create session' }).click();
    const createDialog = page.getByRole('dialog', { name: 'Create your session' });
    await createDialog.getByLabel(/^Sport/).selectOption('pickleball');

    await createDialog.getByRole('button', { name: 'Choose location' }).click();
    await expect(page.getByText('No favorites yet.')).toBeVisible();
    await page.getByRole('menuitem', { name: 'Choose a location…' }).click();

    const locationDialog = page.getByRole('dialog', { name: 'Choose a location' });
    await locationDialog.getByLabel('Search locations').fill('Riverside');
    await locationDialog.getByRole('button', { name: 'Search' }).click();

    const favoriteHeart = locationDialog.getByRole('button', {
      name: `Favorite ${mockLocation.name}`,
    });
    await favoriteHeart.click();
    await expect(
      locationDialog.getByRole('button', { name: `Unfavorite ${mockLocation.name}` }),
    ).toBeVisible();

    await locationDialog.getByText(mockLocation.name, { exact: true }).click();
    await expect(createDialog.getByText(mockLocation.name)).toBeVisible();

    // Reopen the dropdown — the just-favorited location now appears instead of "No favorites yet."
    await createDialog.getByRole('button', { name: 'Change location' }).click();
    await expect(page.getByText('No favorites yet.')).not.toBeVisible();
    await page.getByRole('menuitem', { name: mockLocation.name }).click();
    await expect(createDialog.getByText(mockLocation.name)).toBeVisible();

    await createDialog.getByRole('button', { name: 'Close' }).click();
  });

  await test.step('9. discover a session created by someone else, join it, and see it move into My sessions', async () => {
    const discoverSection = page.getByRole('region', { name: 'Discover sessions' });
    const mySessionsSection = page.getByRole('region', { name: 'My sessions' });

    await expect(discoverSection.getByText(mockDiscoverableSession.title!)).toBeVisible();
    await expect(mySessionsSection.getByText(mockDiscoverableSession.title!)).not.toBeVisible();

    await discoverSection
      .getByRole('button', { name: new RegExp(`${mockDiscoverableSession.title} — View details`) })
      .click();
    const dialog = page.getByRole('dialog', { name: mockDiscoverableSession.title! });
    await dialog.getByRole('button', { name: 'Join' }).click();
    await expect(dialog.getByRole('button', { name: 'Leave' })).toBeVisible();
    await dialog.getByRole('button', { name: 'Close' }).click();

    // autoApprove is true on this fixture, so the join is instant — the session no longer
    // qualifies for discover (already joined) and now shows up in My sessions instead.
    await expect(discoverSection.getByText(mockDiscoverableSession.title!)).not.toBeVisible();
    await expect(mySessionsSection.getByText(mockDiscoverableSession.title!)).toBeVisible();
  });

  await test.step('10. search filters Discover, and the panel toggle hides/shows My sessions', async () => {
    await page.getByRole('button', { name: 'All', exact: true }).click();
    const discoverSection = page.getByRole('region', { name: 'Discover sessions' });

    await page.getByRole('textbox', { name: 'Search sessions' }).fill('nonexistent-session-title');
    await expect(discoverSection.getByText('No sessions match your search.')).toBeVisible();
    await page.getByRole('textbox', { name: 'Search sessions' }).fill('');

    await expect(page.getByRole('region', { name: 'My sessions' })).toBeVisible();
    await page.getByRole('button', { name: 'Hide my sessions' }).click();
    await expect(page.getByRole('region', { name: 'My sessions' })).not.toBeVisible();

    await page.getByRole('button', { name: 'Show my sessions' }).click();
    await expect(page.getByRole('region', { name: 'My sessions' })).toBeVisible();
  });
});

/*
 * SPORT-10 §2e: the reactivate nudge on a non-profile page also covers "Yes" (reactivate),
 * exercised here on the Matches page.
 */
test('Matches — a deactivated sport pill nudge, "Yes" reactivates it', async ({
  page,
  mockSessionId,
}) => {
  await seedSoftDeletedSportProfileOnNextLoad(mockSessionId); // Pickleball soft-deleted
  await seedAuthenticatedSession(page, '/matches');

  const filter = page.getByRole('group', { name: 'Sport filter' });
  const pickleball = filter.getByRole('button', { name: 'Pickleball' });
  await expect(pickleball).toHaveClass(/text-text-muted/);

  await pickleball.click();
  const nudge = page.getByRole('dialog');
  await expect(nudge.getByText('This sport profile is down. Do you want to bring it up?')).toBeVisible();
  await nudge.getByRole('button', { name: 'Yes' }).click();
  await expect(nudge).toBeHidden();

  // Reactivated: the muted "Reactivate Pickleball" pill is gone, Pickleball is a normal pill.
  await expect(
    filter.getByRole('button', { name: 'Pickleball', description: 'Reactivate Pickleball' }),
  ).toBeHidden();
  await expect(filter.getByRole('button', { name: 'Pickleball' })).not.toHaveClass(/text-text-muted/);
});
