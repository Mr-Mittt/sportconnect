import type { Page } from '@playwright/test';
import { installFakeChatSocket } from '../mocks/fakeChatSocket.ts';
import { seedAuthenticatedSession } from '../mocks/fixtures.ts';
import { expect, test } from '../mocks/test.ts';

/*
 * CLIENT-ERR-9: chat's failure states, end to end. The chat service answers with a status only
 * (no error code), so each case is told apart by status. The server errors are forced with
 * `page.route` (the MSW chat handlers only fail on a missing conversation). A chat that is gone for
 * the user shows inline in the panel while the rest of the page keeps working; a failed send keeps
 * the draft and offers Retry. Behavior table: client/docs/MVP/CLIENT-ERR-9_CHAT_ERROR_ADAPTATION.md.
 */

async function forbid(page: Page, pattern: string) {
  await page.route(pattern, (route) =>
    route.fulfill({
      status: 403,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'forbidden', message: 'caller and target are not friends' }),
    }),
  );
}

test('a direct chat that is forbidden shows an inline line and the friends page keeps working', async ({ page }) => {
  await installFakeChatSocket(page);
  await forbid(page, '**/conversations/open/direct/**');
  await seedAuthenticatedSession(page, '/friends');

  await page.getByRole('region', { name: 'Offline' }).getByText('Priya Shah').click();

  await expect(page.getByText("You can't chat with this person right now.")).toBeVisible();
  await expect(page.getByRole('button', { name: 'Retry' })).toHaveCount(0);
  await expect(page.getByLabel('Message', { exact: true })).toBeDisabled();
  // The rest of the page still works: the list is still there and another friend can be selected.
  await expect(page.getByRole('region', { name: 'Offline' })).toBeVisible();
});

test('a group chat that is forbidden shows an inline line and the Groups page keeps working', async ({ page }) => {
  await installFakeChatSocket(page);
  await forbid(page, '**/conversations/open/group/**');
  await seedAuthenticatedSession(page, '/groups');

  await page.getByRole('group', { name: 'Group filter' }).getByRole('button', { name: /Friday Night Football/ }).click();
  await page.getByRole('tab', { name: 'Chat' }).click();

  await expect(page.getByText("You're no longer part of this group's chat.")).toBeVisible();
  await expect(page.getByLabel('Message the group', { exact: true })).toBeDisabled();
  await expect(page.getByRole('tab', { name: 'Chat' })).toBeVisible();
});

test('a failed send keeps the draft and Retry sends it', async ({ page }) => {
  await installFakeChatSocket(page);
  await seedAuthenticatedSession(page, '/friends');
  await page.getByRole('region', { name: 'Offline' }).getByText('Priya Shah').click();
  await expect(page.getByText('No messages yet.')).toBeVisible();

  let failNext = true;
  await page.route('**/conversations/*/messages', (route) => {
    if (route.request().method() === 'POST' && failNext) {
      failNext = false;
      return route.fulfill({ status: 503, contentType: 'text/plain', body: 'unavailable' });
    }
    return route.fallback();
  });

  const composer = page.getByLabel('Message', { exact: true });
  await composer.fill('Still on for Saturday?');
  await composer.press('Enter');

  await expect(page.getByText("Couldn't send. Your message is still in the box.")).toBeVisible();
  await expect(composer).toHaveValue('Still on for Saturday?');

  await page.getByRole('button', { name: 'Retry' }).click();

  await expect(page.getByText('Still on for Saturday?', { exact: true })).toBeVisible();
  await expect(composer).toHaveValue('');
  await expect(page.getByText("Couldn't send. Your message is still in the box.")).toHaveCount(0);
});
