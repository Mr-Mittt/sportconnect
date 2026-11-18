import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/app/apiClient';
import { notificationKeys } from './queryKeys';
import type { Notification } from './types';
import { useClearReadNotifications } from './useClearReadNotifications';
import { useNotifications } from './useNotifications';

function apiResponse<T>(data: T) {
  return { data: { success: true, message: '', data, timestamp: '' } };
}

function notification(id: number, isRead: boolean): Notification {
  return {
    id,
    type: 'session.comment.created',
    entityType: 'SESSION',
    entityId: '42',
    actorIds: [],
    actorCount: 1,
    isRead,
    createdAt: '2026-08-18T09:00:00',
    updatedAt: '2026-08-18T09:00:00',
    actors: [],
    entityTitle: 'Friday Pickup Game',
  };
}

function pageOf(content: Notification[]) {
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

function setup() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { queryClient, wrapper };
}

/** The list the hook sees while the bell is open: ids 1 (unread), 2 and 3 (read). */
const loaded = [notification(1, false), notification(2, true), notification(3, true)];

function listIds(queryClient: QueryClient): number[] | undefined {
  return queryClient
    .getQueryData<{ pages: { content: Notification[] }[] }>(notificationKeys.list())
    ?.pages.flatMap((p) => p.content.map((n) => n.id));
}

describe('useClearReadNotifications (CLIENT-NOTIF-7)', () => {
  afterEach(() => vi.restoreAllMocks());

  it('calls DELETE /notifications/read and answers with the count the server removed', async () => {
    const del = vi.spyOn(apiClient, 'delete').mockResolvedValue(apiResponse(2));
    const { wrapper } = setup();
    const { result } = renderHook(() => useClearReadNotifications(), { wrapper });

    await act(async () => {
      expect(await result.current.mutateAsync()).toBe(2);
    });

    expect(del).toHaveBeenCalledWith('/notifications/read');
  });

  it('removes the loaded read rows at once, before the server answers, and leaves the unread count alone', async () => {
    let finish: (value: unknown) => void = () => {};
    vi.spyOn(apiClient, 'delete').mockImplementation(() => new Promise((resolve) => (finish = resolve)));
    const { queryClient, wrapper } = setup();
    queryClient.setQueryData(notificationKeys.unreadCount, 1);
    queryClient.setQueryData(notificationKeys.list(), { pages: [pageOf(loaded)], pageParams: [0] });
    const { result } = renderHook(() => useClearReadNotifications(), { wrapper });

    act(() => result.current.mutate());

    await waitFor(() => expect(listIds(queryClient)).toEqual([1]));
    expect(queryClient.getQueryData(notificationKeys.unreadCount)).toBe(1);
    expect(result.current.isPending).toBe(true);

    await act(async () => finish(apiResponse(2)));
  });

  it('restores the list when the call fails, without touching the unread count', async () => {
    vi.spyOn(apiClient, 'delete').mockRejectedValue(new Error('boom'));
    const { queryClient, wrapper } = setup();
    queryClient.setQueryData(notificationKeys.unreadCount, 1);
    queryClient.setQueryData(notificationKeys.list(), { pages: [pageOf(loaded)], pageParams: [0] });
    const { result } = renderHook(() => useClearReadNotifications(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync().catch(() => undefined);
    });

    expect(listIds(queryClient)).toEqual([1, 2, 3]);
    expect(queryClient.getQueryData(notificationKeys.unreadCount)).toBe(1);
  });

  it.each([
    ['succeeds', () => Promise.resolve(apiResponse(2))],
    ['fails', () => Promise.reject(new Error('boom'))],
  ])('refetches the list from the server once the call %s', async (_label, outcome) => {
    const get = vi.spyOn(apiClient, 'get').mockResolvedValue(apiResponse(pageOf(loaded)));
    vi.spyOn(apiClient, 'delete').mockImplementation(outcome);
    const { wrapper } = setup();
    const { result } = renderHook(
      () => ({ list: useNotifications(true), clear: useClearReadNotifications() }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.list.data?.pages[0]?.content).toHaveLength(3));
    expect(get).toHaveBeenCalledTimes(1);

    await act(async () => {
      await result.current.clear.mutateAsync().catch(() => undefined);
    });

    await waitFor(() => expect(get).toHaveBeenCalledTimes(2));
  });
});
