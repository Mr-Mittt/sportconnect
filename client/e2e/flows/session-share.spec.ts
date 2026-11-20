import type { Page } from '@playwright/test';
import {
  mockDiscoverableSession,
  mockFriend,
  mockGroupMembers,
  seedAuthenticatedSession,
  seedGroupMembersVolumeOnNextLoad,
} from '../mocks/fixtures.ts';
import { expect, test } from '../mocks/test.ts';

/*
 * CLIENT-SESSION-49: sharing a standalone session with friends from the Players section header (SESSION-66's
 * `POST /api/sessions/{id}/shares`). The default mock has one friend, so each test routes its own friend list on top of MSW;
 * the share endpoint itself is the MSW handler. The session opened is the Discover fixture "Weekend 5-a-side", which the
 * fixture user has NOT joined: any viewer of a standalone session may share it.
 */

const SESSION_ID = mockDiscoverableSession.id;
const sharesUrl = new RegExp(`/api/sessions/${SESSION_ID}/shares$`);

function friend(id: string, fullName: string) {
  return { id, fullName, avatarUrl: null, coverUrl: null, bio: null };
}

const minh = friend('minh-tran', 'Minh Tran');
const lan = friend('lan-pham', 'Lan Pham');

function envelope(data: unknown) {
  return { success: true, message: '', data, timestamp: '' };
}

/** Routes the caller's friend list (and, optionally, who has JOINED the session) on top of MSW. */
async function routeFriends(page: Page, friends: unknown[], joinedUserIds: string[] = []) {
  await page.route(/\/api\/users\/friends$/, (route) => route.fulfill({ json: envelope(friends) }));
  if (joinedUserIds.length > 0) {
    await page.route(new RegExp(`/api/sessions/${SESSION_ID}/participants(\\?.*)?$`), (route) =>
      route.fulfill({
        json: envelope({
          content: joinedUserIds.map((userId, index) => ({
            id: 500 + index,
            sessionId: SESSION_ID,
            userId,
            userFullName: userId,
            userAvatarUrl: null,
            status: 'JOINED',
            rejectReason: null,
            createdAt: '2026-08-01T10:00:00',
          })),
          totalElements: joinedUserIds.length,
          totalPages: 1,
          number: 0,
          size: 20,
          first: true,
          last: true,
          numberOfElements: joinedUserIds.length,
          empty: false,
        }),
      }),
    );
  }
}

async function openSession(page: Page) {
  await page
    .getByRole('region', { name: 'Discover sessions' })
    .getByRole('button', { name: new RegExp(`${mockDiscoverableSession.title} — View details`) })
    .click();
  return page.getByRole('dialog', { name: mockDiscoverableSession.title! });
}

const shareDialog = (page: Page) => page.getByRole('dialog', { name: 'Share with friends' });

test('a viewer shares the session with two friends: joined friends are labelled, the send keeps the dialog open', async ({ page }) => {
  await seedAuthenticatedSession(page, '/matches');
  await routeFriends(page, [mockFriend, minh, lan], [mockFriend.id]);
  const detail = await openSession(page);

  await detail.getByRole('button', { name: 'Share this session' }).click();

  const dialog = shareDialog(page);
  await expect(dialog).toBeVisible();
  // Priya has a JOINED row: labelled, no checkbox. The others have one each, listed first.
  await expect(dialog.getByRole('checkbox')).toHaveCount(2);
  await expect(dialog.getByRole('listitem').filter({ hasText: mockFriend.fullName })).toContainText('Joined');
  await expect(dialog.getByRole('button', { name: 'Share (0)' })).toBeDisabled();

  await dialog.getByRole('checkbox', { name: 'Select Minh Tran' }).click();
  await dialog.getByRole('checkbox', { name: 'Select Lan Pham' }).click();
  const sent = page.waitForRequest((request) => sharesUrl.test(request.url()) && request.method() === 'POST');
  await dialog.getByRole('button', { name: 'Share (2)' }).click();

  expect((await sent).postDataJSON()).toEqual({ userIds: [minh.id, lan.id] });
  await expect(dialog.getByText('Session shared.')).toBeVisible();
  // Stays open; the two stay ticked but disabled; the counter starts again.
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('checkbox', { name: 'Select Minh Tran' })).toBeChecked();
  await expect(dialog.getByRole('checkbox', { name: 'Select Minh Tran' })).toBeDisabled();
  await expect(dialog.getByRole('checkbox', { name: 'Select Lan Pham' })).toBeDisabled();
  await expect(dialog.getByRole('button', { name: 'Share (0)' })).toBeDisabled();
  // The session itself is untouched: a share adds no participant.
  await dialog.getByRole('button', { name: 'Close' }).click();
  await expect(dialog).not.toBeVisible();
  await expect(detail).toBeVisible();
});

test('a "session no longer exists" answer opens the error dialog and "Got it" closes the share dialog too', async ({ page }) => {
  await seedAuthenticatedSession(page, '/matches');
  await routeFriends(page, [minh, lan]);
  await page.route(sharesUrl, (route) =>
    route.fulfill({
      status: 404,
      json: { success: false, message: 'English server prose', data: null, errorCode: 'SESSION_NOT_FOUND', timestamp: '' },
    }),
  );
  const detail = await openSession(page);
  await detail.getByRole('button', { name: 'Share this session' }).click();
  const dialog = shareDialog(page);
  await dialog.getByRole('checkbox', { name: 'Select Minh Tran' }).click();

  await dialog.getByRole('button', { name: 'Share (1)' }).click();

  const error = page.getByRole('dialog', { name: 'Session unavailable' });
  await expect(error.getByRole('alert')).toHaveText('This session no longer exists.');
  await expect(page.locator('[data-sonner-toast]')).toHaveCount(0);
  await error.getByRole('button', { name: 'Got it' }).click();
  await expect(error).not.toBeVisible();
  await expect(dialog).not.toBeVisible();
});

test('at 50 ticked friends a footer warning shows and the unticked boxes are disabled; un-ticking lifts both', async ({ page }) => {
  await seedAuthenticatedSession(page, '/matches');
  const many = Array.from({ length: 52 }, (_, i) => friend(`bulk-${i + 1}`, `Friend ${String(i + 1).padStart(3, '0')}`));
  await routeFriends(page, many);
  const detail = await openSession(page);
  await detail.getByRole('button', { name: 'Share this session' }).click();
  const dialog = shareDialog(page);

  for (let i = 1; i <= 50; i += 1) {
    await dialog.getByRole('checkbox', { name: `Select Friend ${String(i).padStart(3, '0')}` }).check();
  }

  await expect(dialog.getByText('You reached the limit of one sharing turn.')).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Share (50)' })).toBeEnabled();
  await expect(dialog.getByRole('checkbox', { name: 'Select Friend 051' })).toBeDisabled();
  await expect(dialog.getByRole('checkbox', { name: 'Select Friend 052' })).toBeDisabled();

  await dialog.getByRole('checkbox', { name: 'Select Friend 010' }).uncheck();
  await expect(dialog.getByText('You reached the limit of one sharing turn.')).toHaveCount(0);
  await expect(dialog.getByRole('checkbox', { name: 'Select Friend 051' })).toBeEnabled();
});

test('a private standalone session has no Share button', async ({ page }) => {
  await seedAuthenticatedSession(page, '/matches');
  await page.route(new RegExp(`/api/sessions/${SESSION_ID}$`), (route) =>
    route.fulfill({ json: envelope({ ...mockDiscoverableSession, isPublic: false }) }),
  );
  const detail = await openSession(page);

  await expect(detail.getByRole('region', { name: 'Players' })).toBeVisible();
  await expect(detail.getByRole('button', { name: 'Share this session' })).toHaveCount(0);
});

/*
 * CLIENT-GROUP-SESSION-3: a group session is shared with the group's members. Uses "Ladder night" of "Weekend Tennis Ladder" (the test
 * user is its owner and host), opened from the Posts-tab shortcut; the member list is the MSW roster (the test user, Sam Ito, Alex Chen).
 */
async function openGroupSessionShare(page: Page) {
  await page.getByRole('group', { name: 'Group filter' }).getByRole('button', { name: /Weekend Tennis Ladder/ }).click();
  await page
    .getByRole('region', { name: "Today's group sessions" })
    .getByRole('button', { name: 'Ladder night — View details' })
    .click();
  const detail = page.getByRole('dialog').filter({ hasText: 'Ladder night' });
  await detail.getByRole('button', { name: 'Share this session' }).click();
  return page.getByRole('dialog', { name: 'Share with group members' });
}

test('a group session is shared with the group members: the list, the filter, and the request', async ({ page }) => {
  await seedAuthenticatedSession(page, '/groups');
  const dialog = await openGroupSessionShare(page);

  await test.step('1. the dialog lists the other members of the group, never the caller', async () => {
    await expect(dialog.getByText('Sam Ito')).toBeVisible();
    await expect(dialog.getByText('Alex Chen')).toBeVisible();
    await expect(dialog.getByText(`${mockGroupMembers[0].userFullName}`, { exact: true })).toHaveCount(0);
    await expect(dialog.getByRole('button', { name: /Load more/ })).toHaveCount(0);
  });

  await test.step('2. the filter works on the members loaded, by name', async () => {
    await dialog.getByRole('textbox', { name: "Search the group's members" }).fill('sam');
    await expect(dialog.getByText('Sam Ito')).toBeVisible();
    await expect(dialog.getByText('Alex Chen')).toHaveCount(0);
    await dialog.getByRole('textbox', { name: "Search the group's members" }).fill('zzz');
    await expect(dialog.getByText('No members found.')).toBeVisible();
    await dialog.getByRole('textbox', { name: "Search the group's members" }).fill('');
  });

  await test.step('3. sharing sends the user ids picked to the shares endpoint and confirms', async () => {
    const request = page.waitForRequest((r) => /\/api\/sessions\/\d+\/shares$/.test(r.url()) && r.method() === 'POST');
    await dialog.getByRole('checkbox', { name: 'Select Sam Ito' }).check();
    await dialog.getByRole('button', { name: 'Share (1)' }).click();
    expect((await request).postDataJSON()).toEqual({ userIds: [mockGroupMembers[1].userId] });
    await expect(dialog.getByText('Session shared.')).toBeVisible();
    await expect(dialog.getByRole('checkbox', { name: 'Select Sam Ito' })).toBeDisabled();
  });
});

test('the group Share dialog lists 100 members first and loads the rest on request', async ({ page, mockSessionId }) => {
  await seedGroupMembersVolumeOnNextLoad(mockSessionId);
  await seedAuthenticatedSession(page, '/groups');
  const dialog = await openGroupSessionShare(page);

  // 133 members in all (3 + 130): page 1 holds 100 of them, the caller among those, so 99 rows. All 132 others after "Load more".
  await expect(dialog.getByRole('checkbox')).toHaveCount(99);
  await expect(dialog.getByText('Member 130')).toHaveCount(0);

  await dialog.getByRole('button', { name: 'Load more members' }).click();
  await expect(dialog.getByRole('checkbox')).toHaveCount(132);
  await expect(dialog.getByText('Member 130')).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Load more members' })).toHaveCount(0);

  // The filter only sees what is loaded: with the rest loaded, a late member is found by name.
  await dialog.getByRole('textbox', { name: "Search the group's members" }).fill('member 130');
  await expect(dialog.getByRole('checkbox')).toHaveCount(1);
});
