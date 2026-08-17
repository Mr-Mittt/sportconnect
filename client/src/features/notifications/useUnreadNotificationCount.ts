import { useQuery, type QueryKey } from '@tanstack/react-query';
import { apiClient } from '@/app/apiClient';
import type { ApiResponse } from '@/shared/types/api';

// Exported so useNotificationLiveSocket (NTF-3) can invalidate this exact
// query when a live ping arrives — kept here rather than duplicated so
// CLIENT-NOTIF-1's bell/dropdown work reuses the same key.
export const unreadNotificationCountQueryKey: QueryKey = ['notifications', 'unread-count'];

/**
 * Wraps the real `GET /api/notifications/unread-count` (NTF-1). Deliberately
 * minimal — CLIENT-NOTIF-1 builds the full bell/dropdown on top of this same
 * hook rather than a new one.
 */
export function useUnreadNotificationCount(): {
  data: number;
  isLoading: boolean;
  isError: boolean;
} {
  const query = useQuery({
    queryKey: unreadNotificationCountQueryKey,
    queryFn: async () => {
      const response = await apiClient.get<ApiResponse<number>>('/notifications/unread-count');
      return response.data.data;
    },
  });

  return { data: query.data ?? 0, isLoading: query.isLoading, isError: query.isError };
}
