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
 * Clicking a row always marks it read and closes the popover. What else it
 * does depends on `entityType`:
 *  - `SESSION` — calls `onViewSession(entityId)`, deliberately **not** a
 *    navigation. `AppShell` renders its own shell-level `SessionDetailModal`
 *    (fed by `useSessionDetailModalData`, the same hook every page's own
 *    in-place "View details" modal already uses) and passes its own
 *    `setSelectedSessionId` as this callback, so the session detail opens as an
 *    overlay on whatever page the caller is currently on — no route change.
 *    (An earlier version navigated to `/matches?session={id}`; that forced a
 *    page switch the user didn't ask for, and had a real bug — `MatchesPage`
 *    reads its own `?session=` param once, at mount, so re-navigating to it
 *    while already on `/matches` silently did nothing.)
 *  - `USER` — a friend-request notification (U13 / CLIENT-NOTIF-5). Calls
 *    `onViewFriendRequests(entityId)` with the counterparty's user id (the
 *    sender for `created`, the accepter for `accepted` — `entityId` is a user
 *    id for both). `AppShell` wires this to `navigate('/friends', { state: {
 *    focusPersonId } })` — that IS a route change (unlike the session case),
 *    because the Friends rail's incoming-requests section lives on that page
 *    and has no shell-level modal equivalent. The Friends page then pre-selects
 *    that person, or, if they no longer resolve to anyone in the friend/request
 *    lists (request cancelled, account deactivated), opens an "unavailable"
 *    dialog instead.
 *  - anything else — just marks read, no destination.
 */
export function useNotificationBellData(
  onViewSession: (sessionId: number) => void,
  onViewFriendRequests: (personId: string) => void,
) {
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
    } else if (notification.entityType === 'USER') {
      onViewFriendRequests(notification.entityId);
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
