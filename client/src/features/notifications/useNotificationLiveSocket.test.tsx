import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/app/apiClient';
import { useAuthStore } from '@/app/authStore';
import { unreadNotificationCountQueryKey } from './useUnreadNotificationCount';
import { useNotificationLiveSocket } from './useNotificationLiveSocket';

// Mocking @stomp/stompjs's Client itself (rather than a fake raw WebSocket,
// the approach useChatConversation.test.tsx uses for chat's own raw-WS hook)
// — reimplementing STOMP frame negotiation just to unit-test this hook's own
// logic isn't worth it; the real end-to-end wire is already proven by
// NotificationStompIntegrationTest (server module).
const activateMock = vi.fn();
const deactivateMock = vi.fn();
const subscribeMock = vi.fn();
interface LastConfig {
  brokerURL: string;
  reconnectDelay: number;
  maxReconnectDelay: number;
  beforeConnect: () => Promise<void>;
  onConnect: () => void;
  onStompError: (frame: { headers: { message: string } }) => void;
}
let lastConfig: LastConfig;
let lastClient: { connectHeaders?: Record<string, string> };

vi.mock('@stomp/stompjs', () => ({
  // A plain `function`, not an arrow — `new Client(...)` requires a
  // constructible mock; an arrow function can't be used with `new`.
  Client: vi.fn().mockImplementation(function (config: LastConfig) {
    lastConfig = config;
    lastClient = { activate: activateMock, deactivate: deactivateMock, subscribe: subscribeMock } as typeof lastClient;
    return lastClient;
  }),
  ReconnectionTimeMode: { LINEAR: 0, EXPONENTIAL: 1 },
}));

const refreshedSession = {
  data: {
    data: {
      accessToken: 'fresh-token',
      user: { id: '1', email: 'a@b.c', firstName: 'A', lastName: 'B', username: 'ab', phoneNumber: null, avatarUrl: null, roles: ['USER'] },
    },
  },
};

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

describe('useNotificationLiveSocket (NTF-3)', () => {
  beforeEach(() => {
    activateMock.mockClear();
    deactivateMock.mockClear();
    subscribeMock.mockClear();
    useAuthStore.setState({ accessToken: 'token-abc', user: null, isBootstrapping: false });
  });

  it('does not connect when there is no access token', () => {
    useAuthStore.setState({ accessToken: null });

    renderHook(() => useNotificationLiveSocket(), { wrapper });

    expect(activateMock).not.toHaveBeenCalled();
  });

  it('activates a client carrying the access token on the CONNECT frame, and subscribes on connect', async () => {
    renderHook(() => useNotificationLiveSocket(), { wrapper });

    expect(activateMock).toHaveBeenCalledTimes(1);
    await lastConfig.beforeConnect();
    expect(lastClient.connectHeaders).toEqual({ Authorization: 'Bearer token-abc' });

    lastConfig.onConnect();

    expect(subscribeMock).toHaveBeenCalledWith('/user/queue/notifications', expect.any(Function));
  });

  it('writes a received ping straight into the unread-count query cache', () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    function localWrapper({ children }: { children: ReactNode }) {
      return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
    }

    renderHook(() => useNotificationLiveSocket(), { wrapper: localWrapper });
    lastConfig.onConnect();
    const messageHandler = subscribeMock.mock.calls[0][1] as (message: { body: string }) => void;

    messageHandler({ body: JSON.stringify({ notificationId: 42, unreadCount: 3 }) });

    expect(queryClient.getQueryData(unreadNotificationCountQueryKey)).toBe(3);
  });

  it('deactivates the client on unmount', () => {
    const { unmount } = renderHook(() => useNotificationLiveSocket(), { wrapper });

    unmount();

    expect(deactivateMock).toHaveBeenCalledTimes(1);
  });

  describe('token on every connect attempt (CLIENT-NOTIF-6)', () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('sets the reconnect delay deliberately instead of relying on the library default', () => {
      renderHook(() => useNotificationLiveSocket(), { wrapper });

      expect(lastConfig.reconnectDelay).toBe(5000);
      expect(lastConfig.maxReconnectDelay).toBe(30000);
    });

    it('a reconnect sends the token the store holds now, not the one it had at mount', async () => {
      renderHook(() => useNotificationLiveSocket(), { wrapper });
      await lastConfig.beforeConnect();
      expect(lastClient.connectHeaders).toEqual({ Authorization: 'Bearer token-abc' });

      useAuthStore.setState({ accessToken: 'renewed-by-rest' }); // REST refreshed in the meantime
      await lastConfig.beforeConnect();

      expect(lastClient.connectHeaders).toEqual({ Authorization: 'Bearer renewed-by-rest' });
    });

    it('does not refresh when nothing was refused', async () => {
      const refreshSpy = vi.spyOn(apiClient, 'post');
      renderHook(() => useNotificationLiveSocket(), { wrapper });

      await lastConfig.beforeConnect();
      await lastConfig.beforeConnect();

      expect(refreshSpy).not.toHaveBeenCalled();
    });

    it('a refused CONNECT makes the next attempt refresh exactly once and send the new token', async () => {
      const refreshSpy = vi.spyOn(apiClient, 'post').mockResolvedValueOnce(refreshedSession as never);
      renderHook(() => useNotificationLiveSocket(), { wrapper });
      await lastConfig.beforeConnect();

      lastConfig.onStompError({ headers: { message: 'Missing or invalid token on STOMP CONNECT' } });
      await lastConfig.beforeConnect();

      expect(refreshSpy).toHaveBeenCalledTimes(1);
      expect(refreshSpy).toHaveBeenCalledWith('/auth/refresh');
      expect(lastClient.connectHeaders).toEqual({ Authorization: 'Bearer fresh-token' });

      await lastConfig.beforeConnect(); // the following attempt does not refresh again
      expect(refreshSpy).toHaveBeenCalledTimes(1);
    });

    it('stops the socket, and the session ends, when the refresh is definitely refused (4xx)', async () => {
      vi.spyOn(apiClient, 'post').mockRejectedValueOnce({ isAxiosError: true, response: { status: 401 } });
      renderHook(() => useNotificationLiveSocket(), { wrapper });
      await lastConfig.beforeConnect();
      lastClient.connectHeaders = undefined;

      lastConfig.onStompError({ headers: { message: 'x' } });
      await lastConfig.beforeConnect();

      expect(deactivateMock).toHaveBeenCalledTimes(1);
      expect(lastClient.connectHeaders).toBeUndefined();
      expect(useAuthStore.getState().accessToken).toBeNull();
    });

    it('keeps the session and keeps retrying when the refresh gets no answer (5xx)', async () => {
      vi.spyOn(apiClient, 'post').mockRejectedValueOnce({ isAxiosError: true, response: { status: 503 } });
      renderHook(() => useNotificationLiveSocket(), { wrapper });
      await lastConfig.beforeConnect();

      lastConfig.onStompError({ headers: { message: 'x' } });
      await lastConfig.beforeConnect();

      expect(deactivateMock).not.toHaveBeenCalled();
      expect(useAuthStore.getState().accessToken).toBe('token-abc');
      expect(lastClient.connectHeaders).toEqual({ Authorization: 'Bearer token-abc' });
    });
  });
});
