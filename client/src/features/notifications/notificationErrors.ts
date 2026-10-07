import type { QueryClient } from '@tanstack/react-query';
import { getApiError } from '@/shared/lib/apiError';
import { notificationKeys } from './queryKeys';

/**
 * CLIENT-ERR-8: `PUT /notifications/{id}/read` answers `NOTIFICATION_NOT_FOUND` / `NOTIFICATION_FORBIDDEN`
 * for a row that is gone or not the caller's. Marking read is a silent action, so nothing is shown:
 * after the rollback, refetch the list and the unread count so the bell shows the server's truth.
 * Any other failure is left alone.
 */
export function refetchWhenNotificationGone(queryClient: QueryClient, error: unknown): void {
  const { code } = getApiError(error);
  if (code !== 'NOTIFICATION_NOT_FOUND' && code !== 'NOTIFICATION_FORBIDDEN') return;
  void queryClient.invalidateQueries({ queryKey: notificationKeys.list() });
  void queryClient.invalidateQueries({ queryKey: notificationKeys.unreadCount });
}
