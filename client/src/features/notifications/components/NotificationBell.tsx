import { IconBell } from '@tabler/icons-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/ui/popover';
import type { Notification } from '../types';
import { NotificationRow } from './NotificationRow';

interface NotificationBellProps {
  unreadCount: number;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  notifications: Notification[];
  isLoading: boolean;
  isError: boolean;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  onLoadMore: () => void;
  onSelect: (notification: Notification) => void;
  hasUnreadLoaded: boolean;
  onMarkAllRead: () => void;
  isMarkingAllRead: boolean;
}

/**
 * CLIENT-NOTIF-1's bell + dropdown, replacing NTF-3's bare badge placeholder
 * on `TopBar`. Purely presentational and controlled — per `client/CLAUDE.md`'s
 * component convention (and matching `UpcomingMatches`' own precedent: a
 * cross-page component fed entirely by props, never self-fetching), every
 * data hook this needs (`useUnreadNotificationCount`, `useNotifications`,
 * `useMarkNotificationRead`, `useMarkAllNotificationsRead`) is owned by
 * `AppShell` — the page-level (shell-level) component that already wires
 * `useNotificationLiveSocket`/`useSportCatalog`/`useLogout` the same way.
 * Keeping this component prop-driven also means it needs no
 * `QueryClientProvider`/network mocking to story or test in isolation —
 * this Storybook setup has neither a global query-client decorator nor an
 * MSW addon configured.
 */
export function NotificationBell({
  unreadCount,
  isOpen,
  onOpenChange,
  notifications,
  isLoading,
  isError,
  hasNextPage,
  isFetchingNextPage,
  onLoadMore,
  onSelect,
  hasUnreadLoaded,
  onMarkAllRead,
  isMarkingAllRead,
}: NotificationBellProps) {
  return (
    <Popover open={isOpen} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Notifications"
          className="relative flex size-9 cursor-pointer items-center justify-center rounded-full text-text-secondary hover:bg-surface-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-accent"
        >
          <IconBell className="size-5" aria-hidden="true" />
          {!!unreadCount && (
            <span
              className="absolute top-0.5 right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger-solid px-1 text-2xs font-medium text-white"
              aria-label={`${unreadCount} unread notifications`}
            >
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-1 p-0">
        <div className="flex items-center justify-between px-3 pt-2.5 pb-1">
          <span className="text-2sm font-medium text-text-primary">Notifications</span>
          {hasUnreadLoaded && (
            <button
              type="button"
              onClick={onMarkAllRead}
              disabled={isMarkingAllRead}
              className="cursor-pointer text-2xs font-medium text-text-accent hover:underline disabled:cursor-default disabled:opacity-60"
            >
              Mark all read
            </button>
          )}
        </div>

        <div className="max-h-96 overflow-y-auto px-1.5 pb-1.5">
          {isLoading && <p className="px-1.5 py-3 text-2xs text-text-muted">Loading…</p>}
          {isError && (
            <p role="alert" className="px-1.5 py-3 text-2xs text-text-danger">
              Couldn't load notifications.
            </p>
          )}
          {!isLoading && !isError && notifications.length === 0 && (
            <p className="px-1.5 py-3 text-2xs text-text-muted">You're all caught up.</p>
          )}
          {notifications.map((notification) => (
            <NotificationRow key={notification.id} notification={notification} onSelect={onSelect} />
          ))}
          {hasNextPage && (
            <button
              type="button"
              onClick={onLoadMore}
              disabled={isFetchingNextPage}
              className="mt-1 w-full cursor-pointer rounded-[7px] px-2 py-1.5 text-center text-2xs font-medium text-text-secondary hover:bg-surface-1 disabled:cursor-default disabled:opacity-60"
            >
              {isFetchingNextPage ? 'Loading…' : 'Load more'}
            </button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
