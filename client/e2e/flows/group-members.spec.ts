import { seedAuthenticatedSession } from '../mocks/fixtures.ts';
import { expect, test } from '../mocks/test.ts';

/*
 * GRP-3: Members tab — the "find member" filter, "Invite friend" (mocked
 * per this ticket's scope), and the 5 status-grouped lists. Uses
 * `mockOwnedGroup` ("Weekend Tennis Ladder", the only fixture group where
 * the test user is `group_owner`) for the owner-only sections, and
 * `mockGroup` ("Friday Night Football", where the test user is a plain
 * `group_member`) to confirm the role-gated section stays hidden.
 */

test('Group Members tab — owner sees all 5 sections, accept/decline, filtering, and Invite friend', async ({
  page,
}) => {
  await seedAuthenticatedSession(page, '/groups');
  const groupSwitcher = page.getByRole('group', { name: 'Group filter' });
  await groupSwitcher.getByRole('button', { name: /Weekend Tennis Ladder/ }).click();
  await page.getByRole('tab', { name: 'Members' }).click();

  const approveSection = page.getByRole('region', { name: 'Waiting for group approve' });
  const acceptSection = page.getByRole('region', { name: 'Waiting for user accept' });
  const adminSection = page.getByRole('region', { name: 'Group administrator' });
  const membersSection = page.getByRole('region', { name: 'Members' });
  const blacklistSection = page.getByRole('region', { name: 'Blacklist' });

  await test.step('1. all 5 sections render for the owner, with real fixture data', async () => {
    await expect(approveSection.getByText('Priya Shah')).toBeVisible();
    await expect(acceptSection.getByText('Robin Park')).toBeVisible();
    await expect(acceptSection.getByText('Awaiting owner approval')).toBeVisible();
    await expect(adminSection.getByText('Jordan Lee', { exact: false })).toBeVisible(); // owner, listed first
    // Jordan Lee IS the authenticated test session user (mockUser) here —
    // their own row is marked "(you)".
    await expect(adminSection.getByText('(you)', { exact: false })).toBeVisible();
    await expect(adminSection.getByText('Sam Ito')).toBeVisible(); // admin
    await expect(membersSection.getByText('Alex Chen')).toBeVisible();
    await expect(adminSection.getByText('Alex Chen')).not.toBeVisible();
    await expect(blacklistSection.getByText('Coming soon.')).toBeVisible();
  });

  await test.step('2. "find member" filters all visible lists in place, no navigation', async () => {
    await page.getByLabel('Find member').fill('sam');
    await expect(adminSection.getByText('Sam Ito')).toBeVisible();
    await expect(adminSection.getByText('Jordan Lee')).not.toBeVisible();
    await expect(membersSection.getByText('No matches.')).toBeVisible();
    await expect(page).toHaveURL(/\/groups/);

    await page.getByLabel('Find member').fill('');
  });

  await test.step('3. Invite friend opens pre-filled with the current search text, mocked results', async () => {
    await page.getByLabel('Find member').fill('robin');
    await page.getByRole('button', { name: 'Invite friend' }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByLabel('Search friends')).toHaveValue('robin');
    await expect(dialog.getByText('Search coming soon.')).toBeVisible();

    await dialog.getByRole('button', { name: 'Close' }).click();
    await expect(dialog).not.toBeVisible();
    await page.getByLabel('Find member').fill('');
  });

  await test.step('4. Accept moves the join request out of "Waiting for group approve" and into Members', async () => {
    await approveSection.getByRole('button', { name: 'Accept' }).click();
    await expect(approveSection.getByText('Priya Shah')).not.toBeVisible();
    await expect(membersSection.getByText('Priya Shah')).toBeVisible();
  });
});

test('Group Members tab — a plain member never sees "Waiting for group approve"', async ({ page }) => {
  await seedAuthenticatedSession(page, '/groups');
  const groupSwitcher = page.getByRole('group', { name: 'Group filter' });
  await groupSwitcher.getByRole('button', { name: /Friday Night Football/ }).click();
  await page.getByRole('tab', { name: 'Members' }).click();

  await expect(page.getByRole('region', { name: 'Group administrator' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Waiting for group approve' })).not.toBeVisible();
});
