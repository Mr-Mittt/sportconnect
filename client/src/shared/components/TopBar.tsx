import { IconBell, IconSearch } from '@tabler/icons-react';
import { Avatar, AvatarFallback } from '@/shared/ui/avatar';
import { Button } from '@/shared/ui/button';

interface TopBarProps {
  userInitials: string;
  onSearchClick?: () => void;
  onNotificationsClick?: () => void;
  onAvatarClick?: () => void;
}

export function TopBar({
  userInitials,
  onSearchClick,
  onNotificationsClick,
  onAvatarClick,
}: TopBarProps) {
  return (
    <header className="flex items-center justify-between py-3">
      <div className="text-lg font-medium text-text-primary">SportHub</div>
      <div className="flex items-center gap-1.5">
        <Button variant="ghost" size="icon" aria-label="Search" onClick={onSearchClick}>
          <IconSearch className="size-5" aria-hidden="true" />
        </Button>
        <Button variant="ghost" size="icon" aria-label="Notifications" onClick={onNotificationsClick}>
          <IconBell className="size-5" aria-hidden="true" />
        </Button>
        <button
          type="button"
          aria-label="Your account"
          onClick={onAvatarClick}
          className="cursor-pointer rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface-0"
        >
          <Avatar>
            <AvatarFallback>{userInitials}</AvatarFallback>
          </Avatar>
        </button>
      </div>
    </header>
  );
}
