import { seedAuthenticatedSession } from '../mocks/fixtures.ts';
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

test('GroupDiscoveryPanel — Invitations section accepts an invitation and navigates into the new group', async ({
  page,
}) => {
  await seedAuthenticatedSession(page, '/groups');

  const invitationsSection = page.getByRole('region', { name: 'Invitations' });
  await expect(invitationsSection.getByText('Riverside Hoopers')).toBeVisible();
  await expect(invitationsSection.getByText('Invited by Priya Shah')).toBeVisible();

  await invitationsSection.getByRole('button', { name: 'Accept' }).click();

  // Post-accept auto-navigates into the group regardless of the sport it
  // belongs to (Basketball) vs. whatever sport tab was active — the tabbed
  // per-group view (GroupTabs' Posts/Members/etc.) replacing
  // GroupDiscoveryPanel's "All groups" state is the real assertion here.
  await expect(page.getByRole('tab', { name: 'Posts' })).toBeVisible();
  await expect(invitationsSection).not.toBeVisible();
});

test('GroupDiscoveryPanel — Invitations section is absent once there are none to show', async ({ page }) => {
  await seedAuthenticatedSession(page, '/groups');
  const invitationsSection = page.getByRole('region', { name: 'Invitations' });
  await invitationsSection.getByRole('button', { name: 'Reject' }).click();
  await expect(invitationsSection).not.toBeVisible();
});
