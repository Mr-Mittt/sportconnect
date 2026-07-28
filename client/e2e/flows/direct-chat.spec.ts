import { installFakeChatSocket, pushChatEvent } from '../mocks/fakeChatSocket.ts';
import { seedAuthenticatedSession } from '../mocks/fixtures.ts';
import { expect, test } from '../mocks/test.ts';

/*
 * CHAT-10: e2e coverage for FriendChatPanel, wired to the real chat service
 * in production (CHAT-9) but MSW-mocked here (handlers/chat.ts) — plus
 * editing/deleting (CHAT-13) and typing indicators (CHAT-15). Same
 * fake-WebSocket approach as group-chat.spec.ts for real-time push (see that
 * file's header comment for why a fake, in-page socket is a complete
 * substitute here, not a partial one). Happy-path only (user decision,
 * 2026-07-28) — error/edge states (failed send, not-friends 403) are
 * CHAT-11's scope. Uses `mockFriend` ("Priya Shah", id `priya-shah`).
 * Replaces the placeholder note at the end of friends-journey.spec.ts, which
 * this ticket makes stale.
 *
 * Conversation id: the mock chat session (handlers/chat.ts) assigns ids
 * starting at 90001, and each test gets a fresh session with exactly one
 * conversation opened in this spec — so 90001 is deterministic, not a guess.
 */
const CONVERSATION_ID = 90001;

test('Direct chat — send, persist, edit, delete, and real-time push', async ({ page }) => {
  await installFakeChatSocket(page);
  await seedAuthenticatedSession(page, '/friends');

  const offlineSection = page.getByRole('region', { name: 'Offline' });
  const openDirectChat = async () => {
    await offlineSection.getByText('Priya Shah').click();
  };
  await openDirectChat();

  const composer = page.getByLabel('Message', { exact: true });

  await test.step('1. empty state renders', async () => {
    await expect(page.getByText('No messages yet.')).toBeVisible();
  });

  await test.step('2. sending a message appends it and clears the composer', async () => {
    await composer.fill('Ready for Saturday?');
    await composer.press('Enter');
    await expect(page.getByText('Ready for Saturday?')).toBeVisible();
    await expect(composer).toHaveValue('');
  });

  await test.step('3. reloading shows the persisted history, not an empty list', async () => {
    await page.reload();
    await openDirectChat();
    await expect(page.getByText('Ready for Saturday?')).toBeVisible();
  });

  await test.step('4. editing the message shows the updated content and an "(edited)" marker', async () => {
    await page.getByRole('button', { name: 'Edit message' }).click();
    await page.getByLabel('Edit message content').fill('Ready for Saturday? 10am?');
    await page.getByRole('button', { name: 'Save edit' }).click();
    await expect(page.getByText('Ready for Saturday? 10am?')).toBeVisible();
    await expect(page.getByText('(edited)')).toBeVisible();
  });

  await test.step('5. deleting the message replaces it with a "Message deleted" placeholder', async () => {
    await page.getByRole('button', { name: 'Delete message' }).click();
    await expect(page.getByText('Message deleted')).toBeVisible();
    await expect(page.getByText('Ready for Saturday? 10am?')).not.toBeVisible();
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
        content: '10am works for me',
        createdAt: new Date().toISOString(),
        editedAt: null,
        deletedAt: null,
      },
    });
    await expect(page.getByText('10am works for me')).toBeVisible();
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
