import { useCallback } from 'react';
import { chatApiClient } from './chatApiClient';
import { chatKeys } from './queryKeys';
import { useChatConversation } from './useChatConversation';
import type { Conversation } from './types';

/**
 * Opens (or resumes) the 1:1 chat conversation with another user and manages
 * its real-time message stream. Wraps POST /conversations/open/direct/{userId}
 * plus everything useChatConversation provides (history, sendMessage, the
 * WebSocket connection). Fails (isError, via the underlying 403) if the
 * caller and userId aren't currently friends per the chat service's own
 * friendships cache (conversation.ErrNotFriends) — this hook surfaces that,
 * it doesn't re-implement the check.
 */
export function useDirectChatData(userId: string) {
  const openConversation = useCallback(async (): Promise<Conversation> => {
    const response = await chatApiClient.post<Conversation>(`/conversations/open/direct/${userId}`);
    return response.data;
  }, [userId]);

  return useChatConversation(chatKeys.conversation.direct(userId), openConversation);
}
