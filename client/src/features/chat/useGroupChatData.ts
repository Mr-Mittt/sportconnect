import { useCallback } from 'react';
import { chatApiClient } from './chatApiClient';
import { chatKeys } from './queryKeys';
import { useChatConversation } from './useChatConversation';
import type { Conversation } from './types';

/**
 * Opens (or resumes) the chat conversation for a group and manages its
 * real-time message stream. Wraps POST /conversations/open/group/{groupId}
 * plus everything useChatConversation provides (history, sendMessage, the
 * WebSocket connection). Fails (isError, via the underlying 403) if the
 * caller isn't currently a member of the group per the chat service's own
 * membership cache — this hook surfaces that, it doesn't re-check it itself.
 */
export function useGroupChatData(groupId: number) {
  const openConversation = useCallback(async (): Promise<Conversation> => {
    const response = await chatApiClient.post<Conversation>(`/conversations/open/group/${groupId}`);
    return response.data;
  }, [groupId]);

  return useChatConversation(chatKeys.conversation.group(groupId), openConversation);
}
