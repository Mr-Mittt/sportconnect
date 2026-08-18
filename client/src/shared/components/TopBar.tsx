import { IconBell, IconChevronDown, IconLogout, IconSearch } from '@tabler/icons-react';
import { Avatar, AvatarFallback } from '@/shared/ui/avatar';
import { Button } from '@/shared/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu';

interface TopBarUser {
  initials: string;
  name: string;
  email: string;
}

interface TopBarProps {
  user: TopBarUser;
  onSearchClick?: () => void;
  onNotificationsClick?: () => void;
  onLogout: () => void;
  /**
   * NTF-3 placeholder — a bare numeric badge on the bell icon, wired to the
   * real unread count (`useUnreadNotificationCount` + live STOMP updates via
   * `useNotificationLiveSocket`). CLIENT-NOTIF-1 replaces this with the real
   * bell dropdown; undefined/0 renders no badge at all.
   */
  unreadCount?: number;
}

export function TopBar({ user, onSearchClick, onNotificationsClick, onLogout, unreadCount }: TopBarProps) {
  return (
    <header className="flex items-center justify-between py-3">
      <div className="text-lg font-medium text-text-primary">SportHub</div>
      <div className="flex items-center gap-1.5">
        <Button variant="ghost" size="icon" aria-label="Search" onClick={onSearchClick}>
          <IconSearch className="size-5" aria-hidden="true" />
        </Button>
        <div className="relative">
          <Button variant="ghost" size="icon" aria-label="Notifications" onClick={onNotificationsClick}>
            <IconBell className="size-5" aria-hidden="true" />
          </Button>
          {!!unreadCount && (
            <span
              className="absolute top-0.5 right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger-solid px-1 text-2xs font-medium text-white"
              aria-label={`${unreadCount} unread notifications`}
            >
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label="Your account"
              className="flex cursor-pointer items-center gap-0.5 rounded-full py-1 pr-1 pl-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface-0"
            >
              <Avatar>
                <AvatarFallback>{user.initials}</AvatarFallback>
              </Avatar>
              <IconChevronDown className="size-3.5 text-text-muted" aria-hidden="true" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <div className="flex items-center gap-2.5 px-1.5 py-1.5">
              <Avatar className="size-8">
                <AvatarFallback>{user.initials}</AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <div className="truncate text-2sm font-medium text-text-primary">{user.name}</div>
                <div className="truncate text-2xs text-text-muted">{user.email}</div>
              </div>
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={onLogout}>
              <IconLogout className="size-4 text-text-secondary" aria-hidden="true" />
              Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
