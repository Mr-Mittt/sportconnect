import { seedAuthenticatedSession } from '../mocks/fixtures.ts';
import { expect, test } from '../mocks/test.ts';

/*
 * FRIEND-1: the rail's 4 status-grouped sections + search filter, Add-mode
 * directory search (real GET /users/search), sending a friend request,
 * accepting an incoming one, and the profile+chat panel split. Fixtures:
 * mockFriend ("Priya Shah", Offline), mockIncomingFriendRequest ("Hana
 * Kim" -> the test user), mockSearchResultUser ("Owen Clarke", no
 * relationship yet, Add-mode-only).
 */

test('Friends page — rail sections, search, directory search + send request, accept an incoming request', async ({
  page,
}) => {
  await seedAuthenticatedSession(page, '/friends');

  const onlineSection = page.getByRole('region', { name: 'Online' });
  const requestsSection = page.getByRole('region', { name: 'Friend Requests' });
  const offlineSection = page.getByRole('region', { name: 'Offline' });
  const blockedSection = page.getByRole('region', { name: 'Blocked' });

  await test.step('1. all 4 sections render — Online/Blocked always empty, real friend + request data', async () => {
    await expect(onlineSection.getByText('Nothing here yet.')).toBeVisible();
    await expect(requestsSection.getByText('Hana Kim')).toBeVisible();
    await expect(offlineSection.getByText('Priya Shah')).toBeVisible();
    await expect(blockedSection.getByText('Nothing here yet.')).toBeVisible();
  });

  await test.step('2. the rail search filters the Offline/Friend Requests sections in place', async () => {
    await page.getByLabel('Search friends').fill('priya');
    await expect(offlineSection.getByText('Priya Shah')).toBeVisible();
    await expect(requestsSection.getByText('No matches.')).toBeVisible();
    await page.getByLabel('Search friends').fill('');
  });

  await test.step('3. selecting an existing friend shows the profile + chat split, no action bar', async () => {
    await offlineSection.getByText('Priya Shah').click();
    await expect(page.getByText('Weekend hooper, always down for pickup.')).toBeVisible();
    await expect(page.getByLabel('Message')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Send a friend request' })).not.toBeVisible();
  });

  await test.step('4. Add friend searches the real directory and sends a request', async () => {
    await page.getByRole('button', { name: 'Add friend' }).click();
    await page.getByLabel('Search friends').fill('Owen');

    await expect(page.getByText('Matches for "Owen"')).toBeVisible();
    await page.getByText('Owen Clarke').click();

    const sendButton = page.getByRole('button', { name: 'Send a friend request' });
    await expect(sendButton).toBeVisible();
    await sendButton.click();
    await expect(page.getByRole('button', { name: 'Waiting for response' })).toBeVisible();
  });

  await test.step('5. clearing the search returns to the default friend list', async () => {
    await page.getByLabel('Clear search').click();
    await expect(page.getByRole('button', { name: /back to friend list/i })).not.toBeVisible();
    await expect(offlineSection.getByText('Priya Shah')).toBeVisible();
  });

  await test.step('6. accepting an incoming request moves it into Offline and clears the action bar', async () => {
    await requestsSection.getByText('Hana Kim').click();
    await page.getByRole('button', { name: 'Accept' }).click();

    await expect(requestsSection.getByText('Hana Kim')).not.toBeVisible();
    await expect(offlineSection.getByText('Hana Kim')).toBeVisible();
  });

  await test.step('7. sending a mock chat message renders it, but nothing persists past a re-selection', async () => {
    await offlineSection.getByText('Priya Shah').click();
    await page.getByLabel('Message').fill('Pickup game Sunday, you in?');
    await page.getByRole('button', { name: 'Send' }).click();
    await expect(page.getByText('Pickup game Sunday, you in?')).toBeVisible();

    await offlineSection.getByText('Hana Kim').click();
    await expect(page.getByText('Pickup game Sunday, you in?')).not.toBeVisible();
    await expect(page.getByText('No messages yet.')).toBeVisible();
  });
});
