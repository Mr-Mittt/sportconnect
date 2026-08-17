import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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
let lastConfig: { brokerURL: string; connectHeaders: Record<string, string>; onConnect: () => void };

vi.mock('@stomp/stompjs', () => ({
  // A plain `function`, not an arrow — `new Client(...)` requires a
  // constructible mock; an arrow function can't be used with `new`.
  Client: vi.fn().mockImplementation(function (config: typeof lastConfig) {
    lastConfig = config;
    return { activate: activateMock, deactivate: deactivateMock, subscribe: subscribeMock };
  }),
}));

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

  it('activates a client carrying the access token on the CONNECT frame, and subscribes on connect', () => {
    renderHook(() => useNotificationLiveSocket(), { wrapper });

    expect(activateMock).toHaveBeenCalledTimes(1);
    expect(lastConfig.connectHeaders).toEqual({ Authorization: 'Bearer token-abc' });

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
});
