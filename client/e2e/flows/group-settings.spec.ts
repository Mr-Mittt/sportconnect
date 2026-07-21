import { seedAuthenticatedSession } from '../mocks/fixtures.ts';
import { expect, test } from '../mocks/test.ts';

/*
 * GRP-2: Settings tab's owner-only GroupSettings toggles (draft + Save) and
 * the unsaved-changes guard. `mockOwnedGroup` ("Weekend Tennis Ladder") is
 * the only fixture group where the test user is `group_owner` — the toggles
 * are read-only for anyone else, so this spec only needs that one group.
 *
 * Covers two of the guard's three trigger points end-to-end (real router
 * navigation via `useBlocker`, and an in-page tab switch); the third
 * (browser close/refresh via `beforeunload`) can only ever show the
 * browser's own native prompt and isn't something a Playwright assertion
 * can meaningfully exercise.
 */

test('Group Settings tab — toggle, Save, and the unsaved-changes guard', async ({ page }) => {
  await seedAuthenticatedSession(page, '/groups');
  const groupSwitcher = page.getByRole('group', { name: 'Group filter' });
  await groupSwitcher.getByRole('button', { name: /Weekend Tennis Ladder/ }).click();
  await page.getByRole('tab', { name: 'Settings' }).click();

  const inviteToggle = () => page.getByRole('button', { name: /Allow member invites/ });
  const saveButton = () => page.getByRole('button', { name: 'Save' });

  await test.step('1. loads the group type and the three owner-editable toggles', async () => {
    await expect(page.getByText('DEFAULT')).toBeVisible();
    await expect(inviteToggle()).toHaveAttribute('aria-pressed', 'false');
    await expect(saveButton()).toBeDisabled();
  });

  await test.step('2. toggling a setting enables Save; Save persists it', async () => {
    await inviteToggle().click();
    await expect(inviteToggle()).toHaveAttribute('aria-pressed', 'true');
    await expect(saveButton()).toBeEnabled();

    await saveButton().click();
    await expect(saveButton()).toBeDisabled();
    // Persisted server-side — reload and re-open Settings to confirm, not
    // just the optimistic client-side cache write. selectedGroupId is
    // plain in-memory Zustand state (no persistence), so the group
    // selection itself must be redone after a reload, same as the tab.
    await page.reload();
    await groupSwitcher.getByRole('button', { name: /Weekend Tennis Ladder/ }).click();
    await page.getByRole('tab', { name: 'Settings' }).click();
    await expect(inviteToggle()).toHaveAttribute('aria-pressed', 'true');
  });

  await test.step('3. switching tabs with unsaved changes prompts Discard/Save; Discard reverts', async () => {
    await inviteToggle().click(); // back to false, unsaved
    await page.getByRole('tab', { name: 'Posts' }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Discard changes' }).click();
    await expect(dialog).not.toBeVisible();
    // The guarded action ran after discarding — we're on Posts now.
    await expect(page.getByRole('tab', { name: 'Posts', selected: true })).toBeVisible();

    await page.getByRole('tab', { name: 'Settings' }).click();
    await expect(inviteToggle()).toHaveAttribute('aria-pressed', 'true'); // step 2's save, unaffected by the discard
  });

  await test.step('4. navigating away in-app with unsaved changes prompts the same dialog; Save proceeds', async () => {
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
