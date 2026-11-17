import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import { removeReadNotificationsFromCache } from './optimisticNotificationUpdates';
import { notificationKeys } from './queryKeys';
import type { Notification } from './types';

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

function page(content: Notification[], number: number) {
  return {
    content,
    totalPages: 2,
    totalElements: 4,
    number,
    size: 2,
    first: number === 0,
    last: number === 1,
    numberOfElements: content.length,
    empty: content.length === 0,
  };
}

describe('removeReadNotificationsFromCache (CLIENT-NOTIF-7)', () => {
  it('removes the read rows from every loaded page, keeps the unread ones and returns how many went', () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(notificationKeys.list(), {
      pages: [page([notification(1, false), notification(2, true)], 0), page([notification(3, true), notification(4, false)], 1)],
      pageParams: [0, 1],
    });

    const removed = removeReadNotificationsFromCache(queryClient);

    expect(removed).toBe(2);
    const data = queryClient.getQueryData<{ pages: ReturnType<typeof page>[] }>(notificationKeys.list())!;
    expect(data.pages.map((p) => p.content.map((n) => n.id))).toEqual([[1], [4]]);
  });

  it('keeps each page\'s own counters in step with what is left', () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(notificationKeys.list(), {
      pages: [page([notification(1, true), notification(2, true)], 0)],
      pageParams: [0],
    });

    removeReadNotificationsFromCache(queryClient);

    const data = queryClient.getQueryData<{ pages: ReturnType<typeof page>[] }>(notificationKeys.list())!;
    expect(data.pages[0]).toMatchObject({ content: [], numberOfElements: 0, empty: true });
  });

  it('returns 0 and changes nothing when no loaded row is read', () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(notificationKeys.list(), { pages: [page([notification(1, false)], 0)], pageParams: [0] });

    expect(removeReadNotificationsFromCache(queryClient)).toBe(0);
    const data = queryClient.getQueryData<{ pages: ReturnType<typeof page>[] }>(notificationKeys.list())!;
    expect(data.pages[0]!.content.map((n) => n.id)).toEqual([1]);
  });

  it('is a no-op on an empty cache', () => {
    const queryClient = new QueryClient();

    expect(removeReadNotificationsFromCache(queryClient)).toBe(0);
    expect(queryClient.getQueryData(notificationKeys.list())).toBeUndefined();
  });

  it('does not touch the unread-count cache', () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(notificationKeys.unreadCount, 1);
    queryClient.setQueryData(notificationKeys.list(), {
      pages: [page([notification(1, false), notification(2, true)], 0)],
      pageParams: [0],
    });

    removeReadNotificationsFromCache(queryClient);

    expect(queryClient.getQueryData(notificationKeys.unreadCount)).toBe(1);
  });
});
