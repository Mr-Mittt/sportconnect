import { mockFriend, mockLocation, seedAuthenticatedSession } from '../mocks/fixtures.ts';
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
 * caller can only join/leave. `mockLocation` (Basketball, sportId 6) backs
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
 */

test('Matches journey', async ({ page }) => {
  await seedAuthenticatedSession(page, '/matches');

  await test.step('1. load — both sessions render', async () => {
    await expect(page.getByText('Sunday pickup run')).toBeVisible();
    await expect(page.getByText('Friday 5-a-side')).toBeVisible();
  });

  await test.step('2. sport filter narrows the list, "All" restores it', async () => {
    await page.getByRole('button', { name: 'Basketball' }).click();
    await expect(page.getByText('Sunday pickup run')).toBeVisible();
    await expect(page.getByText('Friday 5-a-side')).not.toBeVisible();

    await page.getByRole('button', { name: 'All', exact: true }).click();
    await expect(page.getByText('Friday 5-a-side')).toBeVisible();
  });

  await test.step('3. join then leave the standalone session', async () => {
    await page.getByRole('button', { name: /Sunday pickup run/ }).click();
    const dialog = page.getByRole('dialog', { name: 'Sunday pickup run' });
    // mockSession has a real chosen capacity (10, CLIENT-SESSION-3) — not the 9999 "uncapped"
    // sentinel — so Participants shows "N/10", not the plain "N" the sentinel would render.
    await expect(dialog.getByText('Participants (0/10)')).toBeVisible();

    await dialog.getByRole('button', { name: 'Join' }).click();
    await expect(dialog.getByRole('button', { name: 'Leave' })).toBeVisible();
    await expect(dialog.getByText('Participants (1/10)')).toBeVisible();
    await expect(dialog.getByText('Jordan Lee', { exact: true })).toBeVisible();

    await dialog.getByRole('button', { name: 'Leave' }).click();
    await expect(dialog.getByRole('button', { name: 'Join' })).toBeVisible();
    await expect(dialog.getByText('Participants (0/10)')).toBeVisible();

    await dialog.getByRole('button', { name: 'Close' }).click();
  });

  await test.step('4. cancel the standalone session (creator can manage it)', async () => {
    await page.getByRole('button', { name: /Sunday pickup run/ }).click();
    const dialog = page.getByRole('dialog', { name: 'Sunday pickup run' });

    await dialog.getByRole('button', { name: 'Cancel session' }).click();
    await dialog.getByLabel('Cancellation reason').fill('Court closed for maintenance.');
    await dialog.getByRole('button', { name: 'Confirm cancel' }).click();

    await expect(dialog.getByText('Cancelled', { exact: true })).toBeVisible();
    await expect(dialog.getByText('Reason: Court closed for maintenance.')).toBeVisible();
    await dialog.getByRole('button', { name: 'Close' }).click();

    // List reflects the cancellation without a manual reload.
    await expect(page.getByRole('button', { name: /Sunday pickup run/ })).toContainText('Cancelled');
  });

  await test.step('5. a group session the caller only belongs to hides Cancel, but Join/Leave still work', async () => {
    await page.getByRole('button', { name: /Friday 5-a-side/ }).click();
    const dialog = page.getByRole('dialog', { name: 'Friday 5-a-side' });

    await expect(dialog.getByRole('button', { name: 'Cancel session' })).not.toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Join' })).toBeVisible();
    await dialog.getByRole('button', { name: 'Close' }).click();
  });

  await test.step('6. create a standalone session, searching an existing location', async () => {
    await page.getByRole('button', { name: 'Create session' }).click();
    const createDialog = page.getByRole('dialog', { name: 'Create your session' });
    await createDialog.getByLabel(/^Sport/).selectOption('basketball');

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
    await page.getByRole('button', { name: /Ladder night/ }).click();
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
    await createDialog.getByLabel(/^Sport/).selectOption('basketball');

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
});
