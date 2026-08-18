import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/app/apiClient';
import { useNotificationBellData } from './useNotificationBellData';

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

function apiResponse<T>(data: T) {
  return { data: { success: true, message: '', data, timestamp: '' } };
}

function pageOf(content: unknown[]) {
  return {
    content,
    totalPages: 1,
    totalElements: content.length,
    number: 0,
    size: 10,
    first: true,
    last: true,
    numberOfElements: content.length,
    empty: content.length === 0,
  };
}

function notification(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    type: 'session.comment.created',
    entityType: 'SESSION',
    entityId: '42',
    actorIds: ['actor-1'],
    actorCount: 1,
    isRead: false,
    createdAt: '2026-08-18T09:00:00',
    updatedAt: '2026-08-18T09:00:00',
    actors: [{ id: 'actor-1', fullName: 'Alice Nguyen' }],
    entityTitle: 'Friday Pickup Game',
    ...overrides,
  };
}

describe('useNotificationBellData', () => {
  it('exposes the unread count without fetching the list while closed', async () => {
    vi.spyOn(apiClient, 'get').mockImplementation((url) => {
      if (url === '/notifications/unread-count') return Promise.resolve(apiResponse(3));
      throw new Error(`Unmocked GET ${url}`);
    });

    const { result } = renderHook(() => useNotificationBellData(vi.fn()), { wrapper });

    await waitFor(() => expect(result.current.unreadCount).toBe(3));
    expect(result.current.notifications).toEqual([]);
    expect(apiClient.get).not.toHaveBeenCalledWith('/notifications', expect.anything());
  });

  it('fetches the list once onOpenChange(true) is called', async () => {
    vi.spyOn(apiClient, 'get').mockImplementation((url) => {
      if (url === '/notifications/unread-count') return Promise.resolve(apiResponse(1));
      if (url === '/notifications') return Promise.resolve(apiResponse(pageOf([notification()])));
      throw new Error(`Unmocked GET ${url}`);
    });

    const { result } = renderHook(() => useNotificationBellData(vi.fn()), { wrapper });
    act(() => result.current.onOpenChange(true));

    await waitFor(() => expect(result.current.notifications).toHaveLength(1));
    expect(result.current.hasUnreadLoaded).toBe(true);
  });

  it('onSelect marks the notification read, closes the popover, and calls onViewSession with the numeric entityId for a SESSION entity — no navigation involved', async () => {
    vi.spyOn(apiClient, 'get').mockImplementation((url) => {
      if (url === '/notifications/unread-count') return Promise.resolve(apiResponse(1));
      if (url === '/notifications') return Promise.resolve(apiResponse(pageOf([notification({ id: 9, entityId: '42' })])));
      throw new Error(`Unmocked GET ${url}`);
    });
    const put = vi.spyOn(apiClient, 'put').mockResolvedValue(apiResponse(null));
    const onViewSession = vi.fn();

    const { result } = renderHook(() => useNotificationBellData(onViewSession), { wrapper });
    act(() => result.current.onOpenChange(true));
    await waitFor(() => expect(result.current.notifications).toHaveLength(1));

    act(() => result.current.onSelect(result.current.notifications[0]!));

    await waitFor(() => expect(put).toHaveBeenCalledWith('/notifications/9/read'));
    expect(result.current.isOpen).toBe(false);
    expect(onViewSession).toHaveBeenCalledWith(42);
  });

  it('does not call onViewSession for a non-SESSION entityType', async () => {
    vi.spyOn(apiClient, 'get').mockImplementation((url) => {
      if (url === '/notifications/unread-count') return Promise.resolve(apiResponse(1));
      if (url === '/notifications') {
        return Promise.resolve(apiResponse(pageOf([notification({ id: 9, entityType: 'POST', entityId: '7' })])));
      }
      throw new Error(`Unmocked GET ${url}`);
    });
    vi.spyOn(apiClient, 'put').mockResolvedValue(apiResponse(null));
    const onViewSession = vi.fn();

    const { result } = renderHook(() => useNotificationBellData(onViewSession), { wrapper });
    act(() => result.current.onOpenChange(true));
    await waitFor(() => expect(result.current.notifications).toHaveLength(1));

    act(() => result.current.onSelect(result.current.notifications[0]!));

    expect(onViewSession).not.toHaveBeenCalled();
  });

  it('onMarkAllRead fires one PUT per currently-loaded unread id, skipping already-read ones', async () => {
    vi.spyOn(apiClient, 'get').mockImplementation((url) => {
      if (url === '/notifications/unread-count') return Promise.resolve(apiResponse(2));
      if (url === '/notifications') {
        return Promise.resolve(
          apiResponse(pageOf([notification({ id: 1 }), notification({ id: 2 }), notification({ id: 3, isRead: true })])),
        );
      }
      throw new Error(`Unmocked GET ${url}`);
    });
    const put = vi.spyOn(apiClient, 'put').mockResolvedValue(apiResponse(null));

    const { result } = renderHook(() => useNotificationBellData(vi.fn()), { wrapper });
    act(() => result.current.onOpenChange(true));
    await waitFor(() => expect(result.current.notifications).toHaveLength(3));

    act(() => result.current.onMarkAllRead());

    await waitFor(() => {
      expect(put).toHaveBeenCalledWith('/notifications/1/read');
      expect(put).toHaveBeenCalledWith('/notifications/2/read');
    });
    expect(put).not.toHaveBeenCalledWith('/notifications/3/read');
  });
});
