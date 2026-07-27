import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { chatApiClient } from '@/features/chat/chatApiClient';
import type { ChatMessage, Conversation } from '@/features/chat/types';
import { GroupChatTab } from './GroupChatTab';

// Minimal fake — this file only needs to prove the container wires groupId
// through to useGroupChatData and renders its result; the full WebSocket
// lifecycle (reconnect, backoff, dedup) is already covered by
// useChatConversation.test.tsx and doesn't need re-testing here.
class FakeWebSocket {
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  send(): void {}
  close(): void {
    this.onclose?.();
  }
}

// jsdom has no IntersectionObserver — useInfiniteScrollSentinel (rendered
// inside GroupChatTabView) needs a stub, same pattern Feed.test.tsx uses.
class FakeIntersectionObserver {
  observe = vi.fn();
  disconnect = vi.fn();
  unobserve = vi.fn();
}

const conversation: Conversation = {
  id: 7,
  type: 'GROUP',
  externalGroupId: 42,
  createdAt: '2026-07-26T10:15:00Z',
};

const message: ChatMessage = {
  id: 1,
  conversationId: 7,
  senderId: 'user-1',
  senderFullName: 'Ben Nyx',
  senderAvatarUrl: null,
  content: 'Hey team, ready for Sunday?',
  createdAt: '2026-07-26T10:15:00Z',
};

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

describe('GroupChatTab', () => {
  beforeEach(() => {
    vi.stubGlobal('WebSocket', FakeWebSocket);
    vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('opens the conversation for the given groupId and renders its history', async () => {
    vi.spyOn(chatApiClient, 'post').mockResolvedValueOnce({ data: conversation } as never);
    vi.spyOn(chatApiClient, 'get').mockResolvedValueOnce({ data: [message] } as never);

    render(<GroupChatTab groupId={42} currentUserId="user-1" />, { wrapper });

    expect(screen.getByText('Loading…')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('Hey team, ready for Sunday?')).toBeInTheDocument());
    expect(chatApiClient.post).toHaveBeenCalledWith('/conversations/open/group/42');
  });
});
