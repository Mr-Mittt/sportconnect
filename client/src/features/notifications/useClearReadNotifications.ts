import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/app/apiClient';
import type { ApiResponse } from '@/shared/types/api';
import {
  removeReadNotificationsFromCache,
  restoreNotificationsCache,
  snapshotNotificationsCache,
} from './optimisticNotificationUpdates';
import { notificationKeys } from './queryKeys';

/**
 * CLIENT-NOTIF-7: "Clear read" in the bell. `DELETE /api/notifications/read` (NTF-8) hard-deletes
 * every read notification of the caller, not just the loaded ones, and answers with how many it
 * removed (0 when there is nothing to clear).
 *
 * Optimistic, like the other two bell mutations: the read rows leave every loaded page at once and
 * the snapshot comes back on error. The unread-count cache is not touched, only read rows go, so the
 * badge cannot change. Silent on failure (no toast): the list simply comes back.
 *
 * The list is refetched when the call settles, success or error: the server also deleted read rows
 * beyond the loaded pages and the pagination shifted, and after a failure the refetch shows the real
 * list. The refetch is the truth, the optimistic removal only bridges the wait.
 */
export function useClearReadNotifications() {
  const queryClient = useQueryClient();

  return useMutation({
    meta: { errorDisplay: 'silent' },
    mutationFn: async () => {
      const response = await apiClient.delete<ApiResponse<number>>('/notifications/read');
      return response.data.data;
    },
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: notificationKeys.list() });
      const previous = snapshotNotificationsCache(queryClient);
      removeReadNotificationsFromCache(queryClient);
      return { previous };
    },
    onError: (_error, _variables, context) => {
      if (context) restoreNotificationsCache(queryClient, context.previous);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: notificationKeys.list() });
    },
  });
}
