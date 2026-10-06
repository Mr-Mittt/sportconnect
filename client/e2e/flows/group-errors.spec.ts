import type { Page } from '@playwright/test';
import { seedAuthenticatedSession, seedJoinRequestOnNextLoad } from '../mocks/fixtures.ts';
import { expect, test } from '../mocks/test.ts';

/*
 * CLIENT-ERR-5: the group module's coded errors (A11), localized from the error code, end to end.
 * Server errors are forced with `page.route` (the MSW group handlers do not fail on their own).
 * Uses `mockOwnedGroup` ("Weekend Tennis Ladder", test user = owner) as `group-members.spec.ts` does.
 * Behavior table: client/docs/MVP/CLIENT-ERR-5_GROUP_ERROR_ADAPTATION.md.
 */

function coded(status: number, errorCode: string, message: string, errorParams?: Record<string, unknown>) {
  return {
    status,
    contentType: 'application/json',
    body: JSON.stringify({ success: false, message, data: null, errorCode, errorParams, timestamp: '' }),
  };
}

async function openMembersTab(page: Page, tab = 'Members') {
  await seedAuthenticatedSession(page, '/groups');
  await page
    .getByRole('group', { name: 'Group filter' })
    .getByRole('button', { name: /Weekend Tennis Ladder/ })
    .click();
  await page.getByRole('tab', { name: tab }).click();
}

type Method = 'GET' | 'POST' | 'PUT' | 'DELETE';

/** Forces one endpoint to fail with a coded error; every other method/URL falls through to MSW. */
async function forceFailure(
  page: Page,
  url: RegExp,
  method: Method,
  status: number,
  errorCode: string,
  errorParams?: Record<string, unknown>,
) {
  await page.route(url, (route) =>
    route.request().method() !== method
      ? route.fallback()
      : route.fulfill(coded(status, errorCode, 'English server prose', errorParams)),
  );
}

/** Asserts the shared error dialog's text, that no toast appeared, then dismisses it with "Got it". */
async function expectErrorDialog(page: Page, text: string) {
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('alert')).toHaveText(text);
  await expect(page.locator('[data-sonner-toast]')).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Got it' }).click();
  await expect(dialog).not.toBeVisible();
}

test('accepting a join request that was already handled opens the error dialog and keeps the page usable', async ({
  page,
}) => {
  await page.route(/\/api\/groups\/join-requests\/\d+\/accept$/, (route) =>
    route.fulfill(coded(409, 'GROUP_JOIN_REQUEST_NOT_PENDING', 'Join request is not pending')),
  );
  await openMembersTab(page);

  const approveSection = page.getByRole('region', { name: 'Waiting for group approve' });
  const row = approveSection
    .getByText('Priya Shah')
    .locator('xpath=ancestor::div[contains(@class, "border-hairline")][1]');
  await row.getByRole('button', { name: 'Accept' }).click();

  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('alert')).toHaveText('This join request has already been handled.');
  await expect(page.locator('[data-sonner-toast]')).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Got it' }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole('tab', { name: 'Members' })).toBeVisible();
});

test('the same failure in vi', async ({ page }) => {
  await page.route(/\/api\/groups\/join-requests\/\d+\/accept$/, (route) =>
    route.fulfill(coded(409, 'GROUP_JOIN_REQUEST_NOT_PENDING', 'Join request is not pending')),
  );
  await seedAuthenticatedSession(page, '/groups');
  await page.evaluate(() => {
    localStorage.setItem('locale-storage', JSON.stringify({ state: { locale: 'vi' }, version: 0 }));
  });
  await page.reload();
  await page
    .getByRole('group', { name: 'Bộ lọc nhóm' })
    .getByRole('button', { name: /Weekend Tennis Ladder/ })
    .click();
  await page.getByRole('tab', { name: 'Thành viên' }).click();

  const approveSection = page.getByRole('region', { name: 'Chờ nhóm phê duyệt' });
  const row = approveSection
    .getByText('Priya Shah')
    .locator('xpath=ancestor::div[contains(@class, "border-hairline")][1]');
  await row.getByRole('button', { name: 'Chấp nhận' }).click();

  await expect(page.getByRole('dialog').getByRole('alert')).toHaveText('Yêu cầu tham gia này đã được xử lý.');
});

test('Invite friend shows the member-invites-disabled error on the row and keeps the dialog open', async ({
  page,
}) => {
  await page.route(/\/api\/groups\/\d+\/invitations$/, (route) =>
    route.request().method() !== 'POST'
      ? route.fallback()
      : route.fulfill(coded(403, 'GROUP_MEMBER_INVITES_DISABLED', 'Member invitations are disabled')),
  );
  await openMembersTab(page);

  await page.getByLabel('Find member').fill('priya');
  await page.getByRole('button', { name: 'Invite friend' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('Priya Shah')).toBeVisible();
  await dialog.getByRole('button', { name: 'Invite' }).click();

  await expect(dialog.getByRole('alert')).toHaveText("Members can't invite people to this group.");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Invite' })).toBeVisible();
});

/* ---- The rest of the approved behavior table (en only; vi is proven once above) ---- */

test('Join Group modal shows the already-pending error and stays open', async ({ page }) => {
  await forceFailure(page, /\/api\/groups\/join-requests$/, 'POST', 409, 'GROUP_JOIN_REQUEST_ALREADY_PENDING');
  await seedAuthenticatedSession(page, '/groups');

  await page.getByRole('button', { name: 'Join Group' }).click();
  const dialog = page.getByRole('dialog', { name: 'Join a group' });
  await dialog.getByLabel('Search groups').fill('Riverside');
  await dialog.getByRole('button', { name: 'Search' }).click();
  // The MSW search reads a single sportId, so narrow the filter to the group's sport (Pickleball).
  await dialog.getByRole('button', { name: 'Badminton' }).click();
  await dialog.getByRole('button', { name: 'Search' }).click();
  await dialog.getByRole('button', { name: 'Request to join' }).click();

  await expect(dialog.getByRole('alert')).toHaveText(
    "You've already asked to join this group. It's waiting for approval.",
  );
  await expect(dialog).toBeVisible();
});

test('Create group with a taken name shows the specific error and keeps the form', async ({ page }) => {
  await forceFailure(page, /\/api\/groups$/, 'POST', 409, 'GROUP_NAME_TAKEN');
  await seedAuthenticatedSession(page, '/groups');

  await page.getByRole('button', { name: 'Create Group' }).click();
  const dialog = page.getByRole('dialog', { name: 'Create a group' });
  await dialog.locator('#create-group-name').fill('Sunday Runners');
  await dialog.locator('#create-group-sport').selectOption({ index: 1 });
  await dialog.getByRole('button', { name: 'Create group' }).click();

  await expect(dialog.getByRole('alert')).toHaveText('A group with this name already exists. Pick another name.');
  await expect(dialog.locator('#create-group-name')).toHaveValue('Sunday Runners');
});

test('Delete group without being the owner shows the specific error in the dialog', async ({ page }) => {
  await forceFailure(page, /\/api\/groups\/\d+$/, 'DELETE', 403, 'GROUP_OWNER_REQUIRED');
  await openMembersTab(page, 'Settings');

  await page.getByRole('button', { name: 'Delete Group' }).click();
  const dialog = page.getByRole('dialog').filter({ hasText: 'Delete' });
  await dialog.getByRole('button', { name: 'Delete group' }).click();

  await expect(dialog.getByRole('alert')).toHaveText('Only the group owner can do this.');
  await expect(dialog).toBeVisible();
});

test('Settings save shows the specific error and keeps the draft', async ({ page }) => {
  await forceFailure(page, /\/api\/groups\/\d+\/settings$/, 'PUT', 403, 'GROUP_OWNER_REQUIRED');
  await openMembersTab(page, 'Settings');

  const inviteToggle = page.getByRole('button', { name: /Allow member invites/ });
  await inviteToggle.click();
  await page.getByRole('button', { name: 'Save' }).click();

  await expect(page.getByRole('alert')).toHaveText('Only the group owner can do this.');
  await expect(inviteToggle).toHaveAttribute('aria-pressed', 'true');
});

test('Privacy toggle failure shows the specific error', async ({ page }) => {
  await forceFailure(page, /\/api\/groups\/\d+$/, 'PUT', 403, 'GROUP_ADMIN_REQUIRED');
  await openMembersTab(page, 'Settings');

  await page.getByRole('button', { name: 'Private', exact: true }).click();

  await expect(page.getByRole('alert')).toHaveText('Only the group owner or an admin can do this.');
});

test('Leave group failure shows the specific error on the tab', async ({ page }) => {
  await forceFailure(page, /\/api\/groups\/\d+\/leave$/, 'DELETE', 400, 'GROUP_OWNER_CANNOT_LEAVE');
  await seedAuthenticatedSession(page, '/groups');
  await page
    .getByRole('group', { name: 'Group filter' })
    .getByRole('button', { name: /Friday Night Football/ })
    .click();
  await page.getByRole('tab', { name: 'Settings' }).click();

  await page.getByRole('button', { name: 'Leave Group' }).click();

  await expect(page.getByRole('alert').filter({ hasText: "can't leave" })).toHaveText(
    "The owner can't leave the group. Transfer ownership first.",
  );
});

test('declining a join request that is gone opens the error dialog', async ({ page }) => {
  await forceFailure(page, /\/api\/groups\/join-requests\/\d+\/decline$/, 'PUT', 404, 'GROUP_JOIN_REQUEST_NOT_FOUND');
  await openMembersTab(page);

  const row = page
    .getByRole('region', { name: 'Waiting for group approve' })
    .getByText('Priya Shah')
    .locator('xpath=ancestor::div[contains(@class, "border-hairline")][1]');
  await row.getByRole('button', { name: 'Decline' }).click();

  await expectErrorDialog(page, 'This join request no longer exists.');
});

test('withdrawing a sent invitation that is not yours opens the error dialog', async ({ page }) => {
  await forceFailure(page, /\/api\/groups\/invitations\/\d+$/, 'DELETE', 403, 'GROUP_INVITER_ONLY');
  await openMembersTab(page);

  const row = page
    .getByRole('region', { name: 'Waiting for user accept' })
    .getByText('Robin Park')
    .locator('xpath=ancestor::div[contains(@class, "border-hairline")][1]');
  await row.getByRole('button', { name: 'Withdraw' }).click();

  await expectErrorDialog(page, 'You can only cancel invitations you sent.');
});

test('accepting an invitation into a full group opens the error dialog with the cap', async ({ page }) => {
  await forceFailure(page, /\/api\/groups\/invitations\/\d+\/accept$/, 'PUT', 400, 'GROUP_MEMBER_CAPACITY_REACHED', {
    max: 30,
  });
  await seedAuthenticatedSession(page, '/groups');

  await page.getByRole('region', { name: 'Invitations' }).getByRole('button', { name: 'Accept' }).click();

  await expectErrorDialog(page, 'This group is full (up to 30 members).');
});

test('rejecting an invitation that was already handled opens the error dialog after the confirm closes', async ({
  page,
}) => {
  await forceFailure(page, /\/api\/groups\/invitations\/\d+\/reject$/, 'PUT', 409, 'GROUP_INVITATION_NOT_PENDING');
  await seedAuthenticatedSession(page, '/groups');

  await page.getByRole('region', { name: 'Invitations' }).getByRole('button', { name: 'Reject' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Reject' }).click();

  await expectErrorDialog(page, 'This invitation has already been handled.');
});

test('withdrawing your own join request that is gone opens the error dialog', async ({ page, mockSessionId }) => {
  await seedJoinRequestOnNextLoad(mockSessionId);
  await forceFailure(page, /\/api\/groups\/join-requests\/\d+$/, 'DELETE', 404, 'GROUP_JOIN_REQUEST_NOT_FOUND');
  await seedAuthenticatedSession(page, '/groups');

  await page.getByRole('region', { name: 'Join requests' }).getByRole('button', { name: 'Withdraw' }).click();

  await expectErrorDialog(page, 'This join request no longer exists.');
});
