import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { chatApiClient } from './chatApiClient';
import type { ChatMessage, Conversation } from './types';
import { useGroupChatData } from './useGroupChatData';

// Hand-rolled fake — no mock-socket dependency, matches this repo's "don't
// add a dependency that isn't earning its place" posture for one test file.
class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  url: string;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  closed = false;

  constructor(url: string) {
    this.url = url;
    FakeWebSocket.instances.push(this);
  }

  send(): void {
    // Sending is a no-op here — the real service discards inbound frames too
    // (services/chat/README.md §6.4); nothing under test ever sends over it.
  }

  close(): void {
    this.closed = true;
    this.onclose?.();
  }

  triggerOpen(): void {
    this.onopen?.();
  }

  triggerMessage(message: ChatMessage): void {
    this.onmessage?.({ data: JSON.stringify(message) });
  }

  triggerClose(): void {
    this.onclose?.();
  }

  static latest(): FakeWebSocket {
    const instance = FakeWebSocket.instances.at(-1);
    if (!instance) throw new Error('No FakeWebSocket instance was created');
    return instance;
  }
}

const conversation: Conversation = {
  id: 7,
  type: 'GROUP',
  externalGroupId: 42,
  createdAt: '2026-07-26T10:15:00Z',
};

const messageA: ChatMessage = {
  id: 1,
  conversationId: 7,
  senderId: 'user-1',
  senderFullName: 'Jordan Lee',
  senderAvatarUrl: null,
  content: 'hi',
  createdAt: '2026-07-26T10:15:00Z',
};

const messageB: ChatMessage = {
  id: 2,
  conversationId: 7,
  senderId: 'user-2',
  senderFullName: 'Priya Shah',
  senderAvatarUrl: null,
  content: 'hey',
  createdAt: '2026-07-26T10:16:00Z',
};

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

describe('useGroupChatData (via useChatConversation)', () => {
  beforeEach(() => {
    FakeWebSocket.instances = [];
    vi.stubGlobal('WebSocket', FakeWebSocket);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('opens the conversation, loads history oldest-first, and connects a WebSocket', async () => {
    vi.spyOn(chatApiClient, 'post').mockResolvedValueOnce({ data: conversation } as never);
    vi.spyOn(chatApiClient, 'get').mockResolvedValueOnce({ data: [messageB, messageA] } as never);

    const { result } = renderHook(() => useGroupChatData(42), { wrapper });

    await waitFor(() => expect(result.current.data).toEqual([messageA, messageB]));
    expect(result.current.isError).toBe(false);
    expect(chatApiClient.post).toHaveBeenCalledWith('/conversations/open/group/42');
    expect(chatApiClient.get).toHaveBeenCalledWith('/conversations/7/messages', {
      params: { limit: 50 },
    });

    await waitFor(() => expect(FakeWebSocket.instances).toHaveLength(1));
    expect(FakeWebSocket.latest().url).toContain('/conversations/7/ws');

    FakeWebSocket.latest().triggerOpen();
    await waitFor(() => expect(result.current.connectionStatus).toBe('open'));
  });

  it('merges an incoming WebSocket message into the message list', async () => {
    vi.spyOn(chatApiClient, 'post').mockResolvedValueOnce({ data: conversation } as never);
    vi.spyOn(chatApiClient, 'get').mockResolvedValueOnce({ data: [messageA] } as never);

    const { result } = renderHook(() => useGroupChatData(42), { wrapper });

    await waitFor(() => expect(FakeWebSocket.instances).toHaveLength(1));
    FakeWebSocket.latest().triggerOpen();

    FakeWebSocket.latest().triggerMessage(messageB);

    await waitFor(() => expect(result.current.data).toEqual([messageA, messageB]));
  });

  it('does not duplicate a sent message when the WebSocket echoes it back', async () => {
    vi.spyOn(chatApiClient, 'post')
      .mockResolvedValueOnce({ data: conversation } as never) // open
      .mockResolvedValueOnce({ data: messageA } as never); // send
    vi.spyOn(chatApiClient, 'get').mockResolvedValueOnce({ data: [] } as never);

    const { result } = renderHook(() => useGroupChatData(42), { wrapper });
    await waitFor(() => expect(FakeWebSocket.instances).toHaveLength(1));
    FakeWebSocket.latest().triggerOpen();

    result.current.sendMessage('hi');
    await waitFor(() => expect(result.current.data).toEqual([messageA]));

    // The backend broadcasts the same message back over the socket to every
    // connection on the conversation, including the sender's own.
    FakeWebSocket.latest().triggerMessage(messageA);

    await waitFor(() => expect(result.current.isSending).toBe(false));
    expect(result.current.data).toEqual([messageA]);
  });

  it('surfaces isError when opening the conversation fails (e.g. no longer a member)', async () => {
    vi.spyOn(chatApiClient, 'post').mockRejectedValueOnce({
      isAxiosError: true,
      response: { status: 403 },
    });

    const { result } = renderHook(() => useGroupChatData(42), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(FakeWebSocket.instances).toHaveLength(0);
  });

  it('reports no older page when the first page comes back short of the page size', async () => {
    vi.spyOn(chatApiClient, 'post').mockResolvedValueOnce({ data: conversation } as never);
    vi.spyOn(chatApiClient, 'get').mockResolvedValueOnce({ data: [messageB, messageA] } as never);

    const { result } = renderHook(() => useGroupChatData(42), { wrapper });

    await waitFor(() => expect(result.current.data).toEqual([messageA, messageB]));
    expect(result.current.hasOlderMessages).toBe(false);
  });

  it('loadOlderMessages fetches the next page using the oldest loaded message as the cursor, and prepends it', async () => {
    const fullFirstPage: ChatMessage[] = Array.from({ length: 50 }, (_, i) => ({
      id: 100 - i,
      conversationId: 7,
      senderId: 'user-1',
      senderFullName: 'Jordan Lee',
      senderAvatarUrl: null,
      content: `msg ${100 - i}`,
      createdAt: '2026-07-26T10:15:00Z',
    })); // newest-first: ids 100..51
    const olderPage: ChatMessage[] = [messageB, messageA]; // newest-first: id 2, then id 1

    vi.spyOn(chatApiClient, 'post').mockResolvedValueOnce({ data: conversation } as never);
    const getSpy = vi
      .spyOn(chatApiClient, 'get')
      .mockResolvedValueOnce({ data: fullFirstPage } as never)
      .mockResolvedValueOnce({ data: olderPage } as never);

    const { result } = renderHook(() => useGroupChatData(42), { wrapper });

    await waitFor(() => expect(result.current.data).toHaveLength(50));
    expect(result.current.hasOlderMessages).toBe(true);

    result.current.loadOlderMessages();

    await waitFor(() => expect(result.current.data).toHaveLength(52));
    expect(getSpy).toHaveBeenCalledWith('/conversations/7/messages', {
      params: { before: 51, limit: 50 },
    });
    // Older page's messages (oldest-first: 1, 2) precede the first page's.
    expect(result.current.data?.slice(0, 2).map((m) => m.id)).toEqual([1, 2]);
    expect(result.current.data?.at(-1)?.id).toBe(100);
  });

  it('reconnects with backoff after an unexpected close, refetching history', async () => {
    vi.useFakeTimers();
    vi.spyOn(chatApiClient, 'post').mockResolvedValueOnce({ data: conversation } as never);
    const getSpy = vi
      .spyOn(chatApiClient, 'get')
      .mockResolvedValue({ data: [messageA] } as never);

    const { result } = renderHook(() => useGroupChatData(42), { wrapper });

    await vi.waitFor(() => expect(FakeWebSocket.instances).toHaveLength(1));
    FakeWebSocket.latest().triggerOpen();
    await vi.waitFor(() => expect(getSpy).toHaveBeenCalledTimes(1));

    FakeWebSocket.latest().triggerClose();
    await vi.waitFor(() => expect(result.current.connectionStatus).toBe('reconnecting'));

    await vi.advanceTimersByTimeAsync(1000);

    await vi.waitFor(() => expect(FakeWebSocket.instances).toHaveLength(2));
    FakeWebSocket.latest().triggerOpen();

    await vi.waitFor(() => expect(getSpy).toHaveBeenCalledTimes(2));
  });
});
