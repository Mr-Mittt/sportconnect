import { seedAuthenticatedSession, seedResultsOngoingOnNextLoad } from '../mocks/fixtures.ts';
import { expect, test } from '../mocks/test.ts';

/*
 * CLIENT-GL-38: the session detail's Result section and the record dialog. `overrides.resultsOngoing`
 * makes the Pickleball fixture "Sunday pickup run" ONGOING (end time an hour away) with the fixture
 * friend JOINED next to the caller, and the mock server stores records like SESSION-50 does (a bad
 * record is REJECTED on its own, the others are stored). Badminton's record schema is the mock one
 * (1 to 2 players a side, one required Point score above zero, winner on the left).
 */
test('Session results — log a record, see it in the Result section, then delete it (CLIENT-GL-38)', async ({
  page,
  mockSessionId,
}) => {
  test.setTimeout(60000);
  await seedResultsOngoingOnNextLoad(mockSessionId);
  await seedAuthenticatedSession(page, '/matches');
  await page.getByRole('button', { name: 'Pickleball' }).click();
  await page.getByRole('button', { name: /Sunday pickup run — View details/ }).click();
  const detail = page.getByRole('dialog', { name: 'Sunday pickup run' });

  await test.step('1. the Result section is there, collapsed, with nothing logged yet', async () => {
    const toggle = detail.getByRole('button', { name: /Results \(0\)/ });
    await expect(toggle).toBeVisible();
    await toggle.click();
    await expect(detail.getByText('No results logged yet.')).toBeVisible();
  });

  await test.step('2. Update opens the dialog with one empty placeholder row', async () => {
    await detail.getByRole('button', { name: 'Update' }).click();
    const dialog = page.getByRole('dialog', { name: 'Update results' });
    await expect(dialog).toBeVisible();
    await expect(dialog.locator('[data-row-status="placeholder"]')).toHaveCount(1);
    await expect(dialog.getByRole('button', { name: 'Save' })).toBeDisabled();
    // smaller than the session detail underneath: its title bar and its footer stay in view, at two heights
    for (const height of [900, 600]) {
      await page.setViewportSize({ width: 1280, height });
      // the session detail is inert while the record dialog is open (not in the role tree): find its parts by CSS
      const title = (await page.locator('[data-slot="dialog-title"]', { hasText: 'Sunday pickup run' }).boundingBox())!;
      // the comment composer moved to the top of the thread (2026-11-14): the footer under the detail's body now holds only its action buttons
      const detailBox = (await page.locator('[data-slot="dialog-content"]', { hasText: 'Sunday pickup run' }).first().boundingBox())!;
      const box = (await dialog.boundingBox())!;
      expect(box.y).toBeGreaterThanOrEqual(title.y + title.height - 1);
      expect(box.y + box.height).toBeLessThan(detailBox.y + detailBox.height - 8);
    }
    await page.setViewportSize({ width: 1280, height: 720 });
    // fits a phone: neither the dialog nor its scrolling body is wider than the screen (jsdom has no layout)
    await page.setViewportSize({ width: 320, height: 800 });
    const fits = (await page.evaluate(`(() => {
      const dialogs = Array.from(document.querySelectorAll('[role="dialog"]'));
      const node = dialogs[dialogs.length - 1];
      const scrollers = [node, ...Array.from(node.querySelectorAll('.overflow-y-auto'))];
      return scrollers.every((el) => el.scrollWidth <= el.clientWidth + 1) && document.documentElement.scrollWidth <= window.innerWidth + 1;
    })()`)) as boolean;
    expect(fits).toBe(true);
    await page.setViewportSize({ width: 1280, height: 720 });
  });

  await test.step('3. an incomplete score shows its red border while typing, and Save refuses a team without a player', async () => {
    const dialog = page.getByRole('dialog', { name: 'Update results' });
    const row = dialog.locator('[data-row-status="placeholder"]');
    await row.getByLabel('Winner, player 1').click();
    await dialog.getByRole('option').first().click();
    // a score on one team only
    await dialog.locator('[data-row-status="new"]').getByLabel('Winner, Point').fill('21');
    await expect(dialog.locator('[data-row-status="new"]').getByLabel('Loser, Point')).toHaveAttribute('aria-invalid', 'true');
    await dialog.getByRole('button', { name: 'Save' }).click();
    await expect(dialog.getByText('Select the player.')).toBeVisible();
  });

  await test.step('4. complete the record and save: the dialog closes and the record is listed', async () => {
    const dialog = page.getByRole('dialog', { name: 'Update results' });
    const row = dialog.locator('[data-row-status="new"]');
    await row.getByLabel('Loser, player 1').click();
    await dialog.getByRole('option').first().click();
    await row.getByLabel('Loser, Point').fill('18');
    await dialog.getByRole('button', { name: 'Save' }).click();
    // the dialog stays open after a save (owner, 2026-11-14); Close leaves it
    await expect(dialog.getByRole('button', { name: 'Save' })).toBeDisabled();
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Close' }).click();
    await expect(dialog).not.toBeVisible();
    await expect(detail.getByRole('button', { name: /Results \(1\)/ })).toBeVisible();
    const card = detail.getByTestId('record-card');
    await expect(card).toBeVisible();
    // one line: # | team 1 | score 1 - score 2 | team 2, no Won / Lost labels
    await expect(card).toContainText('#1');
    await expect(card).toContainText('21');
    await expect(card).toContainText('18');
    await expect(card.getByText('Won')).toHaveCount(0);
  });

  await test.step('5. delete it in the dialog (struck through, undo available) and save', async () => {
    await detail.getByRole('button', { name: 'Update' }).click();
    const dialog = page.getByRole('dialog', { name: 'Update results' });
    await dialog.getByRole('button', { name: 'Delete result 1' }).click();
    await expect(dialog.getByTestId('deleted-record')).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Undo changes to result 1' })).toBeVisible();
    await dialog.getByRole('button', { name: 'Save' }).click();
    // the dialog stays open after a save (owner, 2026-11-14); Close leaves it
    await expect(dialog.getByRole('button', { name: 'Save' })).toBeDisabled();
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Close' }).click();
    await expect(dialog).not.toBeVisible();
    await expect(detail.getByRole('button', { name: /Results \(0\)/ })).toBeVisible();
    await expect(detail.getByText('No results logged yet.')).toBeVisible();
  });
});
