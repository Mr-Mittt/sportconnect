import { seedAuthenticatedSession } from '../mocks/fixtures.ts';
import { expect, test } from '../mocks/test.ts';

/*
 * GRP-2: Settings tab's General (group properties: Privacy, rules/schedule,
 * read-only Group type) and Permission (the three owner-only GroupSettings
 * toggles) collapsible sections, their shared draft/Save, and the
 * unsaved-changes guard. `mockOwnedGroup` ("Weekend Tennis Ladder") is the
 * only fixture group where the test user is `group_owner` — required for
 * both sections' editable fields.
 *
 * Covers two of the guard's three trigger points end-to-end (real router
 * navigation via `useBlocker`, and an in-page tab switch); the third
 * (browser close/refresh via `beforeunload`) can only ever show the
 * browser's own native prompt and isn't something a Playwright assertion
 * can meaningfully exercise.
 */

test('Group Settings tab — General/Permission sections, Save, and the unsaved-changes guard', async ({
  page,
}) => {
  await seedAuthenticatedSession(page, '/groups');
  const groupSwitcher = page.getByRole('group', { name: 'Group filter' });
  await groupSwitcher.getByRole('button', { name: /Weekend Tennis Ladder/ }).click();
  await page.getByRole('tab', { name: 'Settings' }).click();

  const generalTrigger = page.getByRole('button', { name: 'General' });
  const permissionTrigger = page.getByRole('button', { name: 'Permission' });
  const inviteToggle = () => page.getByRole('button', { name: /Allow member invites/ });
  const rulesField = () => page.getByLabel('Rules');
  const saveButton = () => page.getByRole('button', { name: 'Save' });

  await test.step('1. both sections default-expanded; collapsing one leaves the other open', async () => {
    await expect(generalTrigger).toHaveAttribute('data-state', 'open');
    await expect(permissionTrigger).toHaveAttribute('data-state', 'open');
    await expect(page.getByText('DEFAULT')).toBeVisible();
    await expect(inviteToggle()).toBeVisible();

    await generalTrigger.click();
    await expect(generalTrigger).toHaveAttribute('data-state', 'closed');
    await expect(page.getByText('DEFAULT')).not.toBeVisible();
    await expect(inviteToggle()).toBeVisible(); // Permission unaffected

    await generalTrigger.click(); // back open for the rest of the test
    await expect(generalTrigger).toHaveAttribute('data-state', 'open');
  });

  await test.step('2. editing General (rules) and Permission (a toggle) share one Save; persists both', async () => {
    await expect(saveButton()).toBeDisabled();

    await rulesField().fill('No slide tackles.');
    await expect(saveButton()).toBeEnabled();
    await inviteToggle().click();
    await expect(inviteToggle()).toHaveAttribute('aria-pressed', 'true');

    await saveButton().click();
    await expect(saveButton()).toBeDisabled();

    // Persisted server-side — reload and re-open Settings to confirm both,
    // not just the optimistic client-side cache writes.
    await page.reload();
    await groupSwitcher.getByRole('button', { name: /Weekend Tennis Ladder/ }).click();
    await page.getByRole('tab', { name: 'Settings' }).click();
    await expect(rulesField()).toHaveValue('No slide tackles.');
    await expect(inviteToggle()).toHaveAttribute('aria-pressed', 'true');
  });

  await test.step('3. switching tabs with an unsaved General edit prompts Discard/Save; Discard reverts', async () => {
    await rulesField().fill('No slide tackles. Bring shin guards.'); // unsaved
    await page.getByRole('tab', { name: 'Posts' }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Discard changes' }).click();
    await expect(dialog).not.toBeVisible();
    await expect(page.getByRole('tab', { name: 'Posts', selected: true })).toBeVisible();

    await page.getByRole('tab', { name: 'Settings' }).click();
    await expect(rulesField()).toHaveValue('No slide tackles.'); // step 2's save, unaffected
  });

  await test.step('4. navigating away in-app with an unsaved Permission edit prompts the same dialog; Save proceeds', async () => {
    await inviteToggle().click(); // false again, unsaved

    await page.getByRole('navigation', { name: 'Primary' }).getByRole('button', { name: 'Home' }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(page).toHaveURL('/groups'); // blocked — navigation hasn't happened yet

    await dialog.getByRole('button', { name: 'Save changes' }).click();
    await expect(dialog).not.toBeVisible();
    await expect(page).toHaveURL('/');
  });
});
