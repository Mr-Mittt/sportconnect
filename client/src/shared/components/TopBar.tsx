import { IconChevronDown, IconLogout, IconSearch, IconSettings } from '@tabler/icons-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
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
  onLogout: () => void;
  /** ACCOUNT-1: opens the Account Settings modal (owned by `AppShell`) from the avatar dropdown. */
  onOpenAccountSettings: () => void;
  /**
   * CLIENT-NOTIF-1: the real bell + dropdown (`NotificationBell`), rendered
   * as a slot rather than TopBar owning unreadCount/click-handler props
   * directly — TopBar stays a plain presentational component, the bell owns
   * its own popover-open state and data hooks. Replaces NTF-3's bare
   * `unreadCount` badge placeholder.
   */
  notificationBell: ReactNode;
}

export function TopBar({
  user,
  onSearchClick,
  onLogout,
  onOpenAccountSettings,
  notificationBell,
}: TopBarProps) {
  const { t } = useTranslation(['shell', 'common']);
  return (
    <header className="flex items-center justify-between py-3">
      <div className="text-lg font-medium text-text-primary">SportHub</div>
      <div className="flex items-center gap-1.5">
        <Button
          variant="ghost"
          size="icon"
          aria-label={t('shell:topBar.searchLabel')}
          onClick={onSearchClick}
        >
          <IconSearch className="size-5" aria-hidden="true" />
        </Button>
        {notificationBell}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label={t('shell:topBar.accountMenuLabel')}
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
            <DropdownMenuItem onSelect={onOpenAccountSettings}>
              <IconSettings className="size-4 text-text-secondary" aria-hidden="true" />
              {t('shell:topBar.accountSettings')}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={onLogout}>
              <IconLogout className="size-4 text-text-secondary" aria-hidden="true" />
              {t('common:logOut')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
