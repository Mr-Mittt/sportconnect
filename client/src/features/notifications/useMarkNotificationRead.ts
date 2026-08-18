import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/app/apiClient';
import {
  decrementUnreadCountCache,
  markNotificationReadInCache,
  restoreNotificationsCache,
  snapshotNotificationsCache,
} from './optimisticNotificationUpdates';
import { notificationKeys } from './queryKeys';

/**
 * Wraps `PUT /api/notifications/{id}/read` (NTF-1, idempotent). Optimistic —
 * flips the row in the cached list immediately and decrements the unread
 * badge by exactly 1, but only if the row was actually unread (a click on an
 * already-read row is a no-op, matching the endpoint's own idempotence).
 * Rolls back the list flip on error; the unread-count decrement is left
 * alone on error (a stale-by-one badge until the next natural refetch/live
 * ping is a smaller UX cost than a second cache write to reconcile it).
 */
export function useMarkNotificationRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (notificationId: number) => {
      await apiClient.put(`/notifications/${notificationId}/read`);
    },
    onMutate: async (notificationId: number) => {
      await queryClient.cancelQueries({ queryKey: notificationKeys.list() });
      const previous = snapshotNotificationsCache(queryClient);
      const wasUnread = markNotificationReadInCache(queryClient, notificationId);
      if (wasUnread) decrementUnreadCountCache(queryClient, 1);
      return { previous };
    },
    onError: (_err, _notificationId, context) => {
      if (context) restoreNotificationsCache(queryClient, context.previous);
    },
  });
}
