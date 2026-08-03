import { mockLocation, seedAuthenticatedSession } from '../mocks/fixtures.ts';
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

    await createDialog.getByRole('button', { name: 'Choose location' }).click();
    const locationDialog = page.getByRole('dialog', { name: 'Choose a location' });
    await locationDialog.getByLabel('Search locations').fill('Riverside');
    await locationDialog.getByRole('button', { name: 'Search' }).click();
    await locationDialog.getByRole('button', { name: new RegExp(mockLocation.name) }).click();

    await expect(createDialog.getByText(mockLocation.name)).toBeVisible();
    // Starts at (Date/Hour/Minute) is left on its own default (Today/one-hour-from-now/:00) —
    // CLIENT-SESSION-2 pre-fills it on open, so there's nothing to fill in here anymore.
    await createDialog.getByLabel(/^Session title/).fill('New pickup game');
    await createDialog.getByLabel(/^Duration in minutes/).fill('90');
    // Open slot is required (CLIENT-SESSION-3); Fee is left on its default "Free" checkbox state.
    await createDialog.getByLabel(/^Open slot/).fill('10');
    await createDialog.getByRole('button', { name: 'Create session' }).click();

    await expect(createDialog).not.toBeVisible();
    await expect(page.getByText('New pickup game')).toBeVisible();
  });
});
