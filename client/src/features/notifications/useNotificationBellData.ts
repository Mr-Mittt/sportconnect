import { useState } from 'react';
import { useMarkAllNotificationsRead } from './useMarkAllNotificationsRead';
import { useMarkNotificationRead } from './useMarkNotificationRead';
import { useNotifications } from './useNotifications';
import { useUnreadNotificationCount } from './useUnreadNotificationCount';
import type { Notification } from './types';

/**
 * `AppShell`'s data hook for the presentational `NotificationBell` — same
 * `use<Feature>Data()` shape as `useMatchesPageData`/`useHomeFeedData`, just
 * scoped to one shell component instead of a whole page, since `AppShell`
 * (not a page) is what owns the bell. Bundles every hook `NotificationBell`
 * needs into the flat prop shape it expects, so `AppShell` itself stays a
 * thin `{...bell}` spread rather than wiring 4 hooks inline.
 *
 * The list query (`useNotifications`) only runs while the popover is open —
 * the badge alone only ever needs `useUnreadNotificationCount`, kept live by
 * `useNotificationLiveSocket` writing straight into that query's cache.
 *
 * Clicking a row marks it read and, since every notification type in scope
 * today is session-scoped (NTF-2's session-only consumer), calls
 * `onViewSession(entityId)` — deliberately **not** a navigation. `AppShell`
 * renders its own shell-level `SessionDetailModal` (fed by
 * `useSessionDetailModalData`, the same hook every page's own in-place
 * "View details" modal already uses) and passes its own `setSelectedSessionId`
 * as this callback, so clicking a notification opens the session's detail
 * as an overlay on whatever page the caller is currently on — no route
 * change, no page switch. (An earlier version of this hook navigated to
 * `/matches?session={id}` instead; that both forced a page switch the user
 * didn't ask for, and had a real bug — `MatchesPage`'s own `initialSessionId`
 * is read once from the URL at mount, so navigating to the same route with a
 * different `?session=` while already on `/matches` silently did nothing.)
 * A future non-SESSION `entityType` just marks read without opening
 * anything, rather than guessing a destination that doesn't exist yet.
 */
export function useNotificationBellData(onViewSession: (sessionId: number) => void) {
  const [isOpen, setIsOpen] = useState(false);

  const { data: unreadCount } = useUnreadNotificationCount();
  const notifications = useNotifications(isOpen);
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();

  const rows = notifications.data?.pages.flatMap((page) => page.content) ?? [];

  const onSelect = (notification: Notification) => {
    markRead.mutate(notification.id);
    setIsOpen(false);
    if (notification.entityType === 'SESSION') {
      onViewSession(Number(notification.entityId));
    }
  };

  return {
    unreadCount,
    isOpen,
    onOpenChange: setIsOpen,
    notifications: rows,
    isLoading: notifications.isLoading,
    isError: notifications.isError,
    hasNextPage: notifications.hasNextPage ?? false,
    isFetchingNextPage: notifications.isFetchingNextPage,
    onLoadMore: () => notifications.fetchNextPage(),
    onSelect,
    hasUnreadLoaded: rows.some((n) => !n.isRead),
    onMarkAllRead: () => markAllRead.mutate(),
    isMarkingAllRead: markAllRead.isPending,
  };
}
