import { installFakeChatSocket, pushChatEvent } from '../mocks/fakeChatSocket.ts';
import { seedAuthenticatedSession } from '../mocks/fixtures.ts';
import { expect, test } from '../mocks/test.ts';

/*
 * CHAT-10: e2e coverage for GroupChatTab, wired to the real chat service in
 * production (CHAT-8) but MSW-mocked here (handlers/chat.ts) — plus
 * editing/deleting (CHAT-13) and typing indicators (CHAT-15). Real-time push
 * (a message/typing signal arriving without a reload) is proven via a fake,
 * in-page WebSocket (fakeChatSocket.ts) rather than a second real browser
 * client — the socket is receive-only in this app (every mutation is REST),
 * so this is a complete substitute for a live second client, not a partial
 * one. Happy-path only (user decision, 2026-07-28) — error/edge states
 * (failed send, membership-gate 403) are CHAT-11's scope. Uses `mockGroup`
 * ("Friday Night Football", id 1). Attachments (CHAT-16) aren't shipped yet
 * — not covered here, see that ticket's own follow-up.
 *
 * Conversation id: the mock chat session (handlers/chat.ts) assigns ids
 * starting at 90001, and each test gets a fresh session with exactly one
 * conversation opened in this spec — so 90001 is deterministic, not a guess.
 */
const CONVERSATION_ID = 90001;

test('Group chat — send, persist, edit, delete, and real-time push', async ({ page }) => {
  await installFakeChatSocket(page);
  await seedAuthenticatedSession(page, '/groups');

  const groupSwitcher = page.getByRole('group', { name: 'Group filter' });
  const openGroupChat = async () => {
    await groupSwitcher.getByRole('button', { name: /Friday Night Football/ }).click();
    await page.getByRole('tab', { name: 'Chat' }).click();
  };
  await openGroupChat();

  const composer = page.getByLabel('Message the group', { exact: true });

  await test.step('1. empty state renders', async () => {
    await expect(page.getByText('No messages yet.')).toBeVisible();
  });

  await test.step('2. sending a message appends it and clears the composer', async () => {
    await composer.fill('Great match today!');
    await composer.press('Enter');
    await expect(page.getByText('Great match today!')).toBeVisible();
    await expect(composer).toHaveValue('');
  });

  await test.step('3. reloading shows the persisted history, not an empty list', async () => {
    await page.reload();
    await openGroupChat();
    await expect(page.getByText('Great match today!')).toBeVisible();
  });

  await test.step('4. editing the message shows the updated content and an "(edited)" marker', async () => {
    await page.getByRole('button', { name: 'Edit message' }).click();
    await page.getByLabel('Edit message content').fill('Great match today, rematch next week!');
    await page.getByRole('button', { name: 'Save edit' }).click();
    await expect(page.getByText('Great match today, rematch next week!')).toBeVisible();
    await expect(page.getByText('(edited)')).toBeVisible();
  });

  await test.step('5. deleting the message replaces it with a "Message deleted" placeholder', async () => {
    await page.getByRole('button', { name: 'Delete message' }).click();
    await expect(page.getByText('Message deleted')).toBeVisible();
    await expect(page.getByText('Great match today, rematch next week!')).not.toBeVisible();
  });

  await test.step('6. a message pushed over the WebSocket appears without a reload', async () => {
    await pushChatEvent(page, CONVERSATION_ID, {
      type: 'MESSAGE_CREATED',
      message: {
        id: 999001,
        conversationId: CONVERSATION_ID,
        senderId: 'priya-shah',
        senderFullName: 'Priya Shah',
        senderAvatarUrl: null,
        content: "I'm in for the rematch",
        createdAt: new Date().toISOString(),
        editedAt: null,
        deletedAt: null,
      },
    });
    await expect(page.getByText("I'm in for the rematch")).toBeVisible();
  });

  await test.step('7. a typing signal shows and then clears the indicator', async () => {
    const typingPayload = {
      conversationId: CONVERSATION_ID,
      userId: 'priya-shah',
      displayName: 'Priya Shah',
    };
    await pushChatEvent(page, CONVERSATION_ID, {
      type: 'USER_TYPING',
      typing: { ...typingPayload, isTyping: true },
    });
    await expect(page.getByText('Priya Shah is typing…')).toBeVisible();

    await pushChatEvent(page, CONVERSATION_ID, {
      type: 'USER_TYPING',
      typing: { ...typingPayload, isTyping: false },
    });
    await expect(page.getByText('Priya Shah is typing…')).not.toBeVisible();
  });
});
