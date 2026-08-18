import type { InfiniteData, QueryClient } from '@tanstack/react-query';
import type { PageResponse } from '@/features/feed/types';
import { notificationKeys } from './queryKeys';
import type { Notification } from './types';

type NotificationsInfiniteData = InfiniteData<PageResponse<Notification>>;

/** Snapshot of the cached notification list, for rollback on mutation error. */
export function snapshotNotificationsCache(queryClient: QueryClient): NotificationsInfiniteData | undefined {
  return queryClient.getQueryData<NotificationsInfiniteData>(notificationKeys.list());
}

/** Restores a snapshot taken by snapshotNotificationsCache — used in onError. */
export function restoreNotificationsCache(queryClient: QueryClient, snapshot: NotificationsInfiniteData | undefined): void {
  queryClient.setQueryData(notificationKeys.list(), snapshot);
}

/**
 * Flips one notification to read across every loaded page. Returns whether
 * it actually flipped anything (it was found and was unread) — callers use
 * this to decide whether the unread-count cache needs decrementing, so a
 * double-click or an already-read row never double-decrements.
 */
export function markNotificationReadInCache(queryClient: QueryClient, notificationId: number): boolean {
  let flipped = false;
  queryClient.setQueryData<NotificationsInfiniteData>(notificationKeys.list(), (data) => {
    if (!data) return data;
    return {
      ...data,
      pages: data.pages.map((page) => ({
        ...page,
        content: page.content.map((notification) => {
          if (notification.id === notificationId && !notification.isRead) {
            flipped = true;
            return { ...notification, isRead: true };
          }
          return notification;
        }),
      })),
    };
  });
  return flipped;
}

/**
 * Flips every currently-loaded unread notification to read. Returns how many
 * were actually flipped, so the caller can decrement the unread-count cache
 * by the right amount — this only covers what's loaded in the dropdown so
 * far (no bulk backend endpoint exists to mark unread rows beyond that in
 * one call, see NTF-1's endpoint list), so a caller with more unread
 * notifications than fit on the loaded page(s) will still see a nonzero
 * badge after "Mark all read", which is correct: it marks what's loaded, not
 * everything that may ever exist server-side.
 */
export function markAllLoadedNotificationsReadInCache(queryClient: QueryClient): number {
  let flippedCount = 0;
  queryClient.setQueryData<NotificationsInfiniteData>(notificationKeys.list(), (data) => {
    if (!data) return data;
    return {
      ...data,
      pages: data.pages.map((page) => ({
        ...page,
        content: page.content.map((notification) => {
          if (!notification.isRead) {
            flippedCount += 1;
            return { ...notification, isRead: true };
          }
          return notification;
        }),
      })),
    };
  });
  return flippedCount;
}

/** Every currently-loaded unread notification id — the set `useMarkAllNotificationsRead` fires one PUT per. */
export function unreadNotificationIdsInCache(queryClient: QueryClient): number[] {
  const data = snapshotNotificationsCache(queryClient);
  if (!data) return [];
  return data.pages.flatMap((page) => page.content.filter((n) => !n.isRead).map((n) => n.id));
}

/** Decrements the unread-count cache by `by`, clamped at 0 — never negative from a stale read. */
export function decrementUnreadCountCache(queryClient: QueryClient, by: number): void {
  if (by <= 0) return;
  queryClient.setQueryData<number>(notificationKeys.unreadCount, (count) => Math.max(0, (count ?? 0) - by));
}
