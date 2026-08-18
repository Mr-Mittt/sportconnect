import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRef } from 'react';
import { apiClient } from '@/app/apiClient';
import {
  decrementUnreadCountCache,
  markAllLoadedNotificationsReadInCache,
  restoreNotificationsCache,
  snapshotNotificationsCache,
  unreadNotificationIdsInCache,
} from './optimisticNotificationUpdates';
import { notificationKeys } from './queryKeys';

/**
 * No bulk `PUT /api/notifications/read-all` exists (NTF-1 only shipped the
 * single-id endpoint) — this fires one `PUT /{id}/read` per currently
 * unread, currently *loaded* notification, in parallel. Deliberately scoped
 * to what's loaded in the dropdown so far, not "every unread notification
 * that may ever exist for this user": fetching every remaining page first
 * just to mark it read would hide an unbounded number of network calls
 * behind one click. If more unread notifications exist beyond the loaded
 * page(s), the badge correctly still shows a nonzero count afterward.
 *
 * The unread id set is captured in `onMutate`, into a ref, *before* the
 * optimistic flip runs — TanStack Query always resolves `onMutate` before
 * calling `mutationFn`, so reading the cache from inside `mutationFn`
 * itself would see it already flipped to all-read and send zero requests.
 */
export function useMarkAllNotificationsRead() {
  const queryClient = useQueryClient();
  const idsToMarkRef = useRef<number[]>([]);

  return useMutation({
    mutationFn: async () => {
      await Promise.all(idsToMarkRef.current.map((id) => apiClient.put(`/notifications/${id}/read`)));
    },
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: notificationKeys.list() });
      const previous = snapshotNotificationsCache(queryClient);
      idsToMarkRef.current = unreadNotificationIdsInCache(queryClient);
      const flippedCount = markAllLoadedNotificationsReadInCache(queryClient);
      decrementUnreadCountCache(queryClient, flippedCount);
      return { previous };
    },
    onError: (_err, _variables, context) => {
      if (context) restoreNotificationsCache(queryClient, context.previous);
    },
  });
}
