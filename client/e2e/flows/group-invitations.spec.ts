import {
  seedAuthenticatedSession,
  seedJoinRequestOnNextLoad,
  seedZeroSportProfilesOnNextLoad,
} from '../mocks/fixtures.ts';
import { expect, test } from '../mocks/test.ts';

/*
 * GRP-7: the invitation approve/accept lifecycle. Two independent journeys:
 * (1) owner/admin approval — mockOwnedGroup's "Waiting for group approve"
 * merges a join request (mockGroupJoinRequest, "Priya Shah") with a
 * pending_owner invitation sent by the group's admin (mockGroupInvitation,
 * Sam Ito -> "Morgan Diaz") into one list; approving the invitation only
 * removes it from the queue — unlike a join-request accept, it does NOT add
 * a member (real backend semantics: approving only moves pending_owner ->
 * pending_user, membership needs the invitee's own accept). (2) invitee
 * acceptance — GroupDiscoveryPanel's new "Invitations" section shows
 * mockReceivedInvitation (Priya Shah invited the test user to
 * mockPublicGroup/"Riverside Hoopers", a Basketball group the test user
 * hasn't joined), accepting navigates straight into it regardless of the
 * currently active sport tab.
 */

test('Group Members tab — merged approval queue shows both row types, approving an invitation only clears the queue row', async ({
  page,
}) => {
  await seedAuthenticatedSession(page, '/groups');
  const groupSwitcher = page.getByRole('group', { name: 'Group filter' });
  await groupSwitcher.getByRole('button', { name: /Weekend Tennis Ladder/ }).click();
  await page.getByRole('tab', { name: 'Members' }).click();

  const approveSection = page.getByRole('region', { name: 'Waiting for group approve' });
  const membersSection = page.getByRole('region', { name: 'Members' });

  await test.step('both a join request and a pending_owner invitation render in one list', async () => {
    await expect(approveSection.getByText('Priya Shah')).toBeVisible(); // join request
    await expect(approveSection.getByText('Morgan Diaz')).toBeVisible(); // invitation, by invitee
    await expect(approveSection.getByText('Invited by Sam Ito')).toBeVisible();
  });

  await test.step('approving the invitation removes it from the queue without adding a member', async () => {
    const invitationRow = approveSection
      .getByText('Morgan Diaz')
      .locator('xpath=ancestor::div[contains(@class, "border-hairline")][1]');
    await invitationRow.getByRole('button', { name: 'Accept' }).click();
    await expect(approveSection.getByText('Morgan Diaz')).not.toBeVisible();
    await expect(membersSection.getByText('Morgan Diaz')).not.toBeVisible();
  });

  await test.step('the join request is unaffected and still accepts normally', async () => {
    await approveSection.getByRole('button', { name: 'Accept' }).click();
    await expect(approveSection.getByText('Priya Shah')).not.toBeVisible();
    await expect(membersSection.getByText('Priya Shah')).toBeVisible();
  });
});

test('GroupDiscoveryPanel — Invitations section accepts an invitation and navigates into the new group, sport pill included', async ({
  page,
}) => {
  await seedAuthenticatedSession(page, '/groups');

  const invitationsSection = page.getByRole('region', { name: 'Invitations' });
  await expect(invitationsSection.getByText('Riverside Hoopers')).toBeVisible();
  await expect(invitationsSection.getByText('Group invitation from Priya Shah')).toBeVisible();

  await invitationsSection.getByRole('button', { name: 'Accept' }).click();

  // Post-accept auto-navigates into the group regardless of the sport it
  // belongs to (Basketball) vs. whatever sport tab was active — the tabbed
  // per-group view (GroupTabs' Posts/Members/etc.) replacing
  // GroupDiscoveryPanel's "All groups" state is the real assertion here.
  await expect(page.getByRole('tab', { name: 'Posts' })).toBeVisible();
  await expect(invitationsSection).not.toBeVisible();

  // GRP-8 part 1: the sport pill now follows the accepted invitation's own
  // sport (Basketball, via B15's sportId) rather than staying on whatever
  // was active before — no more forcing "All" first.
  await expect(
    page.getByRole('group', { name: 'Sport filter' }).getByRole('button', { name: /Basketball/ }),
  ).toHaveAttribute('aria-pressed', 'true');
});

// GRP-8 part 1 follow-up (user-reported, then fully separated 2026-07-25):
// activeSport used to be one store shared between Home Feed and the Groups
// page, so Home Feed's own sport switching could silently affect the group
// selected on the Groups page. Now each page owns its own store
// (`homeFeedStore`/`groupsPageStore`) — this test still holds as a
// regression guard, since a group selection must survive Home Feed doing
// anything at all with its own sport pill.
test('a group selection on the Groups page survives switching sport on Home Feed, but not an explicit "All" click on the Groups page itself', async ({
  page,
}) => {
  await seedAuthenticatedSession(page, '/groups');
  const sportFilter = page.getByRole('group', { name: 'Sport filter' });

  await test.step('open Weekend Tennis Ladder — its own sport pill (Tennis) is active', async () => {
    await page.getByRole('group', { name: 'Group filter' }).getByRole('button', { name: /Weekend Tennis Ladder/ }).click();
    await expect(page.getByRole('tab', { name: 'Posts' })).toBeVisible();
    await expect(sportFilter.getByRole('button', { name: /Tennis/ })).toHaveAttribute('aria-pressed', 'true');
  });

  await test.step('switch to "All" on Home Feed, then return to Groups — the group is still open, pill still Tennis', async () => {
    await page.getByRole('button', { name: 'Home' }).click();
    // GroupsPage and HomeFeedPage both render the shared SportSwitcher with
    // the identical accessible name (role="group", aria-label="Sport
    // filter") — under a slow/contended route transition, GroupsPage's own
    // pills can still be attached for a moment after this click, so an
    // unscoped locator here can race and land on the wrong page's "All"
    // pill (a real, reproduced failure in feed-groups-journey.spec.ts's
    // analogous step). Home Feed's sr-only h1 is a page-unique anchor —
    // waiting for it first guarantees the click below targets Home Feed's
    // own Sport filter, not the Groups page's leftover one.
    await expect(page.getByRole('heading', { name: 'Home Feed' })).toBeVisible();
    await page.getByRole('group', { name: 'Sport filter' }).getByRole('button', { name: 'All', exact: true }).click();

    await page.getByRole('button', { name: 'Groups' }).click();
    await expect(page.getByRole('tab', { name: 'Posts' })).toBeVisible();
    await expect(sportFilter.getByRole('button', { name: /Tennis/ })).toHaveAttribute('aria-pressed', 'true');
  });

  await test.step('clicking "All" directly on the Groups page deselects the group', async () => {
    await sportFilter.getByRole('button', { name: 'All', exact: true }).click();
    await expect(page.getByRole('tab', { name: 'Posts' })).not.toBeVisible();
    // GroupDiscoveryPanel's "All groups" state — always present regardless
    // of fixture data, unlike a specific invitation/group row.
    await expect(page.getByRole('button', { name: 'Join Group' })).toBeVisible();
  });
});

test('GroupDiscoveryPanel — Invitations section is absent once there are none to show', async ({ page }) => {
  await seedAuthenticatedSession(page, '/groups');
  const invitationsSection = page.getByRole('region', { name: 'Invitations' });
  // GRP-8 part 2: Reject now opens a confirmation dialog (optional reason)
  // before actually firing — clicking through it, with no reason typed,
  // exercises the "reason is optional" decision.
  await invitationsSection.getByRole('button', { name: 'Reject' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Reject' }).click();
  await expect(invitationsSection).not.toBeVisible();
});

// GRP-8 part 3
test('GroupDiscoveryPanel — Join requests section withdraws the current user\'s own pending request', async ({
  page,
  mockSessionId,
}) => {
  await seedJoinRequestOnNextLoad(mockSessionId);
  await seedAuthenticatedSession(page, '/groups');

  const joinRequestsSection = page.getByRole('region', { name: 'Join requests' });
  await expect(joinRequestsSection.getByText('Riverside Hoopers')).toBeVisible();

  await joinRequestsSection.getByRole('button', { name: 'Withdraw' }).click();
  await expect(joinRequestsSection).not.toBeVisible();
});

// GRP-8 part 5 — the test user has zero sport profiles here (override), so
// accepting a Basketball invitation must gate on adding that sport first.
test('GroupDiscoveryPanel — accepting an invitation for a sport the invitee lacks offers to add it first', async ({
  page,
  mockSessionId,
}) => {
  await seedZeroSportProfilesOnNextLoad(mockSessionId);
  await seedAuthenticatedSession(page, '/groups');

  const invitationsSection = page.getByRole('region', { name: 'Invitations' });
  await invitationsSection.getByRole('button', { name: 'Accept' }).click();

  await test.step('the intro dialog explains the sport will be added, OK opens AddSportModal', async () => {
    const introDialog = page.getByRole('dialog', { name: 'Add this sport to your profile?' });
    await expect(introDialog.getByText(/This Basketball group/)).toBeVisible();
    await introDialog.getByRole('button', { name: 'OK' }).click();
  });

  await test.step('AddSportModal is pre-selected to Basketball; completing it accepts the invitation', async () => {
    const addSportDialog = page.getByRole('dialog', { name: 'Add a sport' });
    await expect(addSportDialog.getByLabel('Sport')).toHaveValue('basketball');
    await addSportDialog.getByLabel('Skill level').selectOption('beginner');
    await addSportDialog.getByRole('button', { name: 'Add sport' }).click();

    await expect(page.getByRole('tab', { name: 'Posts' })).toBeVisible();
    await expect(invitationsSection).not.toBeVisible();
  });
});
