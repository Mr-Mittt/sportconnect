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
    // CLIENT-NOTIF-5: PENDING_SENT now shows a "Waiting for response" status + a "Cancel request"
    // button (was a lone disabled "Waiting for response" button).
    await expect(page.getByText('Waiting for response')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Cancel request' })).toBeVisible();
  });

  await test.step('5. cancelling the outgoing request withdraws it', async () => {
    // The seeded outgoing request to Diego Alvarez (mockSentFriendRequest) is the one with a
    // resolvable requestId; select it from the rail's Friend Requests section and cancel.
    await page.getByLabel('Clear search').click();
    await requestsSection.getByText('Diego Alvarez').click();
    await page.getByRole('button', { name: 'Cancel request' }).click();
    await expect(requestsSection.getByText('Diego Alvarez')).not.toBeVisible();
    await expect(page.getByText('Select a friend to view their profile and chat.')).toBeVisible();
  });

  await test.step('6. the default friend list is intact', async () => {
    await expect(page.getByRole('button', { name: /back to friend list/i })).not.toBeVisible();
    await expect(offlineSection.getByText('Priya Shah')).toBeVisible();
  });

  await test.step('7. accepting an incoming request moves it into Offline and clears the action bar', async () => {
    await requestsSection.getByText('Hana Kim').click();
    // exact: true — CLIENT-SESSION-12's mockInvitedSession ("Tuesday drop-in") now also renders
    // in this page's own Upcoming rail (shared useUpcomingMatches), with its own accessible name
    // "Tuesday drop-in — Accept" — a non-exact match on "Accept" is ambiguous between that and
    // the real friend-request Accept button, whose accessible name is exactly "Accept".
    await page.getByRole('button', { name: 'Accept', exact: true }).click();

    await expect(requestsSection.getByText('Hana Kim')).not.toBeVisible();
    await expect(offlineSection.getByText('Hana Kim')).toBeVisible();
  });

  // A 7th step here used to send a message through FriendChatPanel's old
  // local-state-only mock and assert it didn't persist past a re-selection.
  // CHAT-9 wired the panel to the real chat service (useDirectChatData), so
  // that premise is no longer true. Real, MSW-backed chat e2e coverage
  // (including a full direct-chat send/edit/delete/real-time journey) is now
  // `e2e/flows/direct-chat.spec.ts` (CHAT-10) — not duplicated here, per this
  // repo's one-spec-per-feature convention (e.g. post-deep-link.spec.ts vs.
  // the feed spec).
});
