import { seedAuthenticatedSession, seedResultsOngoingOnNextLoad, seedResultsRecordsOnNextLoad } from '../mocks/fixtures.ts';
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
    // CLIENT-GL-49: no valid record, no scoreboard
    await expect(detail.getByTestId('result-scoreboard')).toHaveCount(0);
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
    // the footer says so, green and centered (owner, 2026-11-16)
    const saved = dialog.getByRole('status');
    await expect(saved).toHaveText('Results saved');
    await expect(saved).toHaveCSS('text-align', 'center');
    await expect(saved).toHaveCSS('color', 'rgb(21, 128, 61)'); // text-text-success
    await dialog.getByRole('button', { name: 'Close' }).click();
    await expect(dialog).not.toBeVisible();
    await expect(detail.getByRole('button', { name: /Results \(1\)/ })).toBeVisible();
    const card = detail.getByTestId('record-card');
    await expect(card).toBeVisible();
    // one line: team 1 | score 1 - score 2 | team 2 and the copy-id button, no record number, no Won / Lost labels
    await expect(card).not.toContainText('#1');
    await expect(card).toContainText('21');
    await expect(card).toContainText('18');
    await expect(card.getByText('Won')).toHaveCount(0);
    // CLIENT-GL-49: the sport's scoreboard sits above the list: the columns its schema names,
    // a row per joined player, one game each for the two who played, the caller's row marked.
    const board = detail.getByTestId('result-scoreboard');
    await expect(board).toBeVisible();
    await expect(board.getByRole('columnheader')).toHaveText(['#', 'Player', 'Games', 'Won', 'Lost', 'Win +/-']);
    await expect(board.getByTestId('scoreboard-row').first()).toBeVisible();
    await expect(board.locator('[aria-current="true"]')).toHaveCount(1);
    await expect(board.locator('[aria-current="true"]')).toContainText('(You)');
    // the winner is first (games, then wins): one game, one win, no loss, +1 win difference
    await expect(board.getByTestId('scoreboard-row').first().locator('td')).toHaveText(['1', '1', '1', '0', '+1']);
    // it is below the record list, and the title bar folds it (open by default) and opens it again
    expect((await board.boundingBox())!.y).toBeGreaterThan((await card.boundingBox())!.y);
    const bar = board.getByRole('button', { name: /Scoreboard/ });
    await expect(bar).toHaveAttribute('aria-expanded', 'true');
    await bar.click();
    await expect(board.getByRole('table')).toHaveCount(0);
    await bar.click();
    await expect(board.getByRole('table')).toBeVisible();
    // the scoreboard fits a phone: no sideways scroll
    await page.setViewportSize({ width: 320, height: 800 });
    expect(
      await page.evaluate(`(() => { const el = document.querySelector('[data-testid="result-scoreboard"]'); return el.scrollWidth <= el.clientWidth + 1; })()`),
    ).toBe(true);
    await page.setViewportSize({ width: 1280, height: 720 });
  });

  await test.step('5. delete it in the dialog (struck through, undo available) and save', async () => {
    await detail.getByRole('button', { name: 'Update' }).click();
    const dialog = page.getByRole('dialog', { name: 'Update results' });
    // CLIENT-GL-49: the dialog has the scoreboard too, and it follows the rows: striking the only record out empties it
    await expect(dialog.getByTestId('result-scoreboard')).toBeVisible();
    await expect(dialog.getByTestId('scoreboard-row').first().locator('td').first()).toHaveText('1');
    await dialog.getByRole('button', { name: 'Delete result 1' }).click();
    await expect(dialog.getByTestId('result-scoreboard')).toHaveCount(0);
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
    await expect(detail.getByTestId('result-scoreboard')).toHaveCount(0);
  });
});

/*
 * CLIENT-GL-39: record commands in the session thread. `resultsRecords` seeds two logged games between the caller
 * (Jordan Lee) and the fixture friend (Priya Shah), both JOINED. A command is never posted as a comment; an invalid
 * one shows a system-style line to the caller only, and it is gone when the modal is closed and opened again.
 */
test('Session results — record commands in the thread: hints, invalid, add, copy id then delete (CLIENT-GL-39)', async ({
  page,
  context,
  mockSessionId,
}) => {
  test.setTimeout(90000);
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await seedResultsRecordsOnNextLoad(mockSessionId);
  await seedAuthenticatedSession(page, '/matches');
  await page.getByRole('button', { name: 'Pickleball' }).click();
  await page.getByRole('button', { name: /Sunday pickup run — View details/ }).click();
  const detail = page.getByRole('dialog', { name: 'Sunday pickup run' });
  const composer = detail.getByRole('textbox', { name: 'Add a comment' });
  await expect(detail.getByRole('button', { name: /Results \(2\)/ })).toBeVisible();

  await test.step('1. ":" lists the three command templates, ":a" narrows to :add, plain text shows none', async () => {
    await composer.fill(':');
    await expect(detail.getByRole('list', { name: 'Record commands' }).locator('li')).toHaveCount(3);
    await composer.fill(':a');
    await expect(detail.getByRole('list', { name: 'Record commands' }).locator('li')).toHaveCount(1);
    await composer.fill('hello');
    await expect(detail.getByRole('list', { name: 'Record commands' })).toHaveCount(0);
  });

  await test.step('1b. the hints are keyboard stops before Send in the tab order, and what is typed is bold', async () => {
    const hints = detail.getByRole('list', { name: 'Record commands' }).getByRole('button');
    await composer.fill(':');
    await composer.press('ArrowDown');
    await expect(hints.nth(0)).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(hints.nth(1)).toBeFocused();
    await page.keyboard.press('ArrowUp');
    await expect(hints.nth(0)).toBeFocused();
    await page.keyboard.press('ArrowUp');
    await expect(composer).toBeFocused();
    // Tab from the box: the three hints, then Send
    await page.keyboard.press('Tab');
    await expect(hints.nth(0)).toBeFocused();
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    await expect(hints.nth(2)).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(detail.getByRole('button', { name: 'Post comment' })).toBeFocused();
    // bold: the typed part of the template
    await composer.fill(':add ');
    const boldWords = detail.getByRole('list', { name: 'Record commands' }).locator('.font-semibold');
    await expect(boldWords).toHaveText([':add']);
    await composer.fill('');
  });

  await test.step('2. an invalid command shows a caller-only line, keeps its text and posts no comment', async () => {
    // A name typed without being picked is not a player (CLIENT-GL-50: a player is a chip that carries the id).
    await composer.fill(':add @Nobody 21 vs 15');
    await composer.press('Enter');
    await expect(detail.getByTestId('command-notices')).toContainText('Your update is invalid. Follow the hint, [...] is optional.');
    await expect(composer).toHaveText(':add @Nobody 21 vs 15');
    await expect(detail.getByRole('region', { name: 'Discussion' }).locator('p', { hasText: ':add @Nobody' })).toHaveCount(0);
  });

  await test.step('3. a valid :add adds a game, clears the box and posts no comment', async () => {
    await composer.fill('');
    await composer.pressSequentially(':add @Jord');
    await composer.press('Enter');
    await composer.pressSequentially('21 vs 15 @Priy');
    await composer.press('Enter');
    await expect(composer.getByRole('img')).toHaveCount(2);
    await composer.press('Enter');
    await expect(composer).toHaveText('');
    await expect(detail.getByRole('button', { name: /Results \(3\)/ })).toBeVisible();
    await expect(detail.getByText('21 vs 15')).toHaveCount(0);
  });

  await test.step('4. the copy button puts the real record id on the clipboard and :del removes that game', async () => {
    await detail.getByRole('button', { name: /Results \(3\)/ }).click();
    await detail.getByRole('button', { name: 'Copy result id' }).first().click();
    const copied = await page.evaluate<string>('navigator.clipboard.readText()');
    expect(copied).toMatch(/^\d+$/);
    await composer.fill(`:del ${copied}`);
    await composer.press('Enter');
    await expect(detail.getByRole('button', { name: /Results \(2\)/ })).toBeVisible();
  });

  await test.step('5. the caller-only line is gone after closing and reopening the modal', async () => {
    await composer.fill(':del 99999');
    await composer.press('Enter');
    await expect(detail.getByTestId('command-notices')).toContainText('Your update is invalid. Follow the hint, [...] is optional.');
    // the rejected text is still in the box, so closing asks first (owner, 2026-11-16)
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Leave', exact: true }).click();
    await expect(detail).not.toBeVisible();
    await page.getByRole('button', { name: /Sunday pickup run — View details/ }).click();
    await expect(page.getByRole('dialog', { name: 'Sunday pickup run' }).getByRole('textbox', { name: 'Add a comment' })).toBeVisible();
    await expect(page.getByTestId('command-notices')).toHaveCount(0);
  });
});
