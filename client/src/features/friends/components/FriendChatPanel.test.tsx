import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { chatApiClient } from '@/features/chat/chatApiClient';
import type { ChatMessage, Conversation } from '@/features/chat/types';
import { FriendChatPanel } from './FriendChatPanel';

// Minimal fake — this file only needs to prove the container wires userId
// through to useDirectChatData and renders its result; the full WebSocket
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
// inside FriendChatPanelView) needs a stub, same pattern Feed.test.tsx uses.
class FakeIntersectionObserver {
  observe = vi.fn();
  disconnect = vi.fn();
  unobserve = vi.fn();
}

const conversation: Conversation = {
  id: 9,
  type: 'DIRECT',
  externalGroupId: null,
  createdAt: '2026-07-26T10:15:00Z',
};

const message: ChatMessage = {
  id: 1,
  conversationId: 9,
  senderId: 'user-2',
  senderFullName: 'Priya Shah',
  senderAvatarUrl: null,
  content: "I'm in, what time?",
  createdAt: '2026-07-26T10:15:00Z',
  editedAt: null,
  deletedAt: null,
};

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

describe('FriendChatPanel', () => {
  beforeEach(() => {
    vi.stubGlobal('WebSocket', FakeWebSocket);
    vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('opens the conversation for the given userId and renders its history', async () => {
    vi.spyOn(chatApiClient, 'post').mockResolvedValueOnce({ data: conversation } as never);
    vi.spyOn(chatApiClient, 'get').mockResolvedValueOnce({ data: [message] } as never);

    render(<FriendChatPanel userId="user-2" currentUserId="user-1" />, { wrapper });

    expect(screen.getByText('Loading…')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("I'm in, what time?")).toBeInTheDocument());
    expect(chatApiClient.post).toHaveBeenCalledWith('/conversations/open/direct/user-2');
  });
});
