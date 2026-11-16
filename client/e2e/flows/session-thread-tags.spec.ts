import type { Page } from '@playwright/test';
import { seedAuthenticatedSession, seedResultsOngoingOnNextLoad, seedResultsRecordsOnNextLoad } from '../mocks/fixtures.ts';
import { expect, test } from '../mocks/test.ts';

/** Pastes plain text into the comment box the way a clipboard paste does (a string expression: this config has no DOM types). */
async function pasteInto(page: Page, text: string): Promise<void> {
  await page.evaluate(
    `(() => {
      const element = document.querySelector('[role="textbox"][aria-label="Add a comment"]');
      const data = new DataTransfer();
      data.setData('text/plain', ${JSON.stringify(text)});
      element.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
    })()`,
  );
}

/*
 * CLIENT-GL-50: the chip composer of the session thread. `resultsOngoing` makes the Pickleball fixture "Sunday pickup
 * run" ONGOING with the caller (Jordan Lee) and the fixture friend (Priya Shah) JOINED, so `GET /sessions/{id}/thread-people`
 * (the mock follows SESSION-GL-64's name rule) has two people to offer. Real caret and Backspace behaviour on a chip is
 * only provable in a browser, so it is proven here, not in Vitest.
 */
test('Session thread — tag a person in a comment and in a reply, Backspace removes a whole chip (CLIENT-GL-50)', async ({
  page,
  context,
  mockSessionId,
}) => {
  test.setTimeout(90000);
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await seedResultsOngoingOnNextLoad(mockSessionId);
  await seedAuthenticatedSession(page, '/matches');
  await page.getByRole('button', { name: 'Pickleball' }).click();
  await page.getByRole('button', { name: /Sunday pickup run — View details/ }).click();
  const detail = page.getByRole('dialog', { name: 'Sunday pickup run' });
  const discussion = detail.getByRole('region', { name: 'Discussion' });
  const composer = detail.getByRole('textbox', { name: 'Add a comment' });
  // The list is a server search: Enter picks only once it is on screen (before that it would send the text).
  const listed = (name: string) =>
    detail.getByRole('listbox', { name: 'People you can tag' }).getByRole('option', { name });

  await test.step('1. @ opens the people list, matched on the start of a word (a later word counts, the middle of a word does not)', async () => {
    await composer.click();
    await composer.pressSequentially('@shah');
    await expect(listed('Priya Shah')).toBeVisible();
    await composer.fill('@iya');
    await expect(detail.getByRole('listbox', { name: 'People you can tag' })).toHaveCount(0);
    await composer.fill('');
  });

  await test.step('2. Enter picks: the name becomes one chip, and the box shows the name only', async () => {
    await composer.pressSequentially('hi @pri');
    await expect(listed('Priya Shah')).toBeVisible();
    await composer.press('Enter');
    await expect(composer.getByRole('img', { name: 'Mention: Priya Shah' })).toBeVisible();
    await expect(composer).toHaveText('hi @Priya Shah');
  });

  await test.step('2b. copying the chip out of the box gives the plain @Full Name, no id', async () => {
    await composer.press('Control+A');
    await composer.press('Control+C');
    const copied = await page.evaluate<string>('navigator.clipboard.readText()');
    expect(copied.trim()).toBe('hi @Priya Shah');
    await composer.press('End');
  });

  await test.step('3. Backspace deletes the whole chip, not a letter of it', async () => {
    await composer.press('Backspace'); // the blank after the chip
    await composer.press('Backspace'); // the chip
    await expect(composer.getByRole('img')).toHaveCount(0);
    await expect(composer).toHaveText('hi');
  });

  await test.step('4. a comment with a tag is posted, and the thread shows the chip with the name only', async () => {
    await composer.pressSequentially(' @pri');
    await expect(listed('Priya Shah')).toBeVisible();
    await composer.press('Enter');
    await composer.pressSequentially('see you at 7');
    await composer.press('Enter');
    await expect(composer).toHaveText('');
    await expect(discussion.getByRole('img', { name: 'Mention: Priya Shah' })).toBeVisible();
    await expect(discussion).toContainText('hi @Priya Shah see you at 7');
    // Never the id markup on screen.
    await expect(discussion).not.toContainText('](');
    // Copying a chip out of the thread gives the plain @Full Name too.
    await discussion.getByRole('img', { name: 'Mention: Priya Shah' }).dblclick();
    await page.keyboard.press('Control+C');
    const copiedFromThread = await page.evaluate<string>('navigator.clipboard.readText()');
    expect(copiedFromThread).toContain('Priya');
    expect(copiedFromThread).not.toContain('](');
    expect(copiedFromThread).not.toMatch(/[0-9a-f]{8}-/);
  });

  await test.step('5. a reply can tag too, with the same list; the caller is never offered themselves in a normal comment', async () => {
    await discussion.getByRole('button', { name: 'Reply' }).first().click();
    const reply = discussion.getByRole('textbox', { name: /Reply to/ });
    await reply.pressSequentially('thanks @jor');
    await expect(detail.getByRole('listbox', { name: 'People you can tag' })).toHaveCount(0);
    await reply.fill('thanks @pri');
    await expect(listed('Priya Shah')).toBeVisible();
    await reply.press('Enter');
    await reply.press('Enter');
    await expect(discussion.getByRole('img', { name: 'Mention: Priya Shah' })).toHaveCount(2);
  });
});

test('Session thread — a pasted record command turns its names into chips (CLIENT-GL-50)', async ({
  page,
  mockSessionId,
}) => {
  test.setTimeout(90000);
  await seedResultsRecordsOnNextLoad(mockSessionId);
  await seedAuthenticatedSession(page, '/matches');
  await page.getByRole('button', { name: 'Pickleball' }).click();
  await page.getByRole('button', { name: /Sunday pickup run — View details/ }).click();
  const detail = page.getByRole('dialog', { name: 'Sunday pickup run' });
  const composer = detail.getByRole('textbox', { name: 'Add a comment' });
  await expect(detail.getByRole('button', { name: /Results \(2\)/ })).toBeVisible();

  await test.step('1. the first player becomes a chip, the last @word stays open for the picker (its trailing blank is removed)', async () => {
    await composer.click();
    await pasteInto(page, ':add @Jordan Lee 21 vs 15 @Priya Shah ');
    await expect(composer.getByRole('img', { name: 'Mention: Jordan Lee' })).toBeVisible();
    await expect(composer).toHaveText(':add @Jordan Lee 21 vs 15 @Priya Shah');
    await expect(detail.getByRole('listbox', { name: 'Players' }).getByRole('option', { name: 'Priya Shah' })).toBeVisible();
  });

  await test.step('2. picking the last player and sending logs the game, nothing is posted as a comment', async () => {
    await composer.press('Enter');
    await expect(composer.getByRole('img')).toHaveCount(2);
    await composer.press('Enter');
    await expect(composer).toHaveText('');
    await expect(detail.getByRole('button', { name: /Results \(3\)/ })).toBeVisible();
    await expect(detail.getByText('21 vs 15')).toHaveCount(0);
  });

  await test.step('2b. the caller is a player: the list says (you) and puts them first', async () => {
    await composer.pressSequentially(':add @');
    const options = detail.getByRole('listbox', { name: 'Players' }).getByRole('option');
    await expect(options.first()).toContainText('Jordan Lee (you)');
    await composer.press('Escape');
    await composer.press('Control+A');
    await composer.press('Backspace');
    await expect(composer).toHaveText('');
  });

  await test.step('3. a pasted name nobody has stays plain text and the command is refused', async () => {
    await pasteInto(page, ':add @Nobody 21 vs 15 @Priya Shah 3 ');
    await composer.press('Enter');
    const notices = detail.getByTestId('command-notices');
    await expect(notices).toContainText('Your update is invalid. Follow the hint, [...] is optional.');
    await expect(notices).not.toContainText('(2)');
  });

  await test.step('4. the same refusal again counts: one line, "(2)", then "(3)"', async () => {
    const notices = detail.getByTestId('command-notices');
    await composer.press('Enter');
    await expect(notices).toContainText('Your update is invalid. Follow the hint, [...] is optional. (2)');
    await composer.press('Enter');
    await expect(notices).toContainText('(3)');
    await expect(notices.getByText(/Your update is invalid/)).toHaveCount(1);
  });
});
