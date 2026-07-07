import {
  IconCalendarEvent,
  IconHome,
  IconUser,
  IconUsers,
  IconUsersGroup,
  type Icon,
} from '@tabler/icons-react';
import { cn } from '@/shared/lib/utils';

export type NavTabKey = 'home' | 'friends' | 'groups' | 'matches' | 'profile';

interface NavTabsProps {
  active: NavTabKey;
  onChange: (tab: NavTabKey) => void;
}

const tabs: ReadonlyArray<{ key: NavTabKey; label: string; TabIcon: Icon }> = [
  { key: 'home', label: 'Home', TabIcon: IconHome },
  { key: 'friends', label: 'Friends', TabIcon: IconUsers },
  { key: 'groups', label: 'Groups', TabIcon: IconUsersGroup },
  { key: 'matches', label: 'Matches', TabIcon: IconCalendarEvent },
  { key: 'profile', label: 'Profile', TabIcon: IconUser },
];

/**
 * Presentational primary nav row — does not own routing. The parent (AppShell)
 * decides what onChange does.
 */
export function NavTabs({ active, onChange }: NavTabsProps) {
  return (
    // overflow-x-auto: five tabs outgrow a 375px viewport (the mockup never
    // tested below 680px) — the row scrolls within itself rather than the page
    // overflowing sideways (HF-8)
    <nav aria-label="Primary" className="border-hairline-b flex gap-1.5 overflow-x-auto border-border pb-2">
      {tabs.map(({ key, label, TabIcon }) => {
        const isActive = key === active;
        return (
          <button
            key={key}
            type="button"
            aria-current={isActive ? 'page' : undefined}
            onClick={() => onChange(key)}
            className={cn(
              'flex shrink-0 cursor-pointer items-center gap-1 rounded-lg px-2 py-1.5 text-2sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-accent',
              isActive
                ? 'font-medium text-text-primary'
                : 'text-text-secondary hover:text-text-primary',
            )}
          >
            <TabIcon className="size-4" aria-hidden="true" />
            {label}
          </button>
        );
      })}
    </nav>
  );
}
