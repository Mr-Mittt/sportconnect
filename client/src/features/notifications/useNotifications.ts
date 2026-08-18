import { useInfiniteQuery } from '@tanstack/react-query';
import { apiClient } from '@/app/apiClient';
import { getNextPageParam } from '@/features/feed/pagination';
import type { PagedApiResponse } from '@/features/feed/types';
import { notificationKeys } from './queryKeys';
import type { Notification } from './types';

const PAGE_SIZE = 10;

/**
 * Wraps `GET /api/notifications` (NTF-1, newest-active-first) in TanStack's
 * native `useInfiniteQuery` shape, same pagination contract as
 * `usePersonalFeed`/`useSessionComments` (`getNextPageParam` derives the next
 * Spring Data page from the previous page's own `last`/`number`, never a
 * client-side counter). `enabled` (default true) lets `NotificationBell` only
 * fetch the list once the dropdown is actually opened — the unread badge
 * itself never needs this query, only `useUnreadNotificationCount`.
 */
export function useNotifications(enabled = true) {
  return useInfiniteQuery({
    queryKey: notificationKeys.list(),
    queryFn: async ({ pageParam }) => {
      const response = await apiClient.get<PagedApiResponse<Notification>>('/notifications', {
        params: { page: pageParam, size: PAGE_SIZE },
      });
      return response.data.data;
    },
    initialPageParam: 0,
    getNextPageParam,
    enabled,
  });
}
