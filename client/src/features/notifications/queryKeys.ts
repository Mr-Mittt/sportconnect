import { unreadNotificationCountQueryKey } from './useUnreadNotificationCount';

/**
 * Single source of truth for this feature's TanStack Query keys, same
 * convention as `feedKeys`/`sessionKeys`. `unreadCount` re-exports NTF-3's
 * existing key rather than redefining it — `useNotificationLiveSocket`
 * already writes straight into that exact key on a live ping.
 */
export const notificationKeys = {
  all: ['notifications'] as const,
  list: () => [...notificationKeys.all, 'list'] as const,
  unreadCount: unreadNotificationCountQueryKey,
};
