import { IconMessage2, IconMessages, IconSettings } from '@tabler/icons-react';
import { useRef } from 'react';
import { cn } from '@/shared/lib/utils';

export type GroupTabKey = 'posts' | 'chat' | 'settings';

interface GroupTabsProps {
  activeTab: GroupTabKey;
  onChange: (tab: GroupTabKey) => void;
}

const TABS: { key: GroupTabKey; label: string; Icon: typeof IconMessage2 }[] = [
  { key: 'posts', label: 'Posts', Icon: IconMessage2 },
  { key: 'chat', label: 'Chat', Icon: IconMessages },
  { key: 'settings', label: 'Settings', Icon: IconSettings },
];

/**
 * The per-group vertical tab nav nested inside `group-main`
 * (`design-reference-group-feed.html`'s Posts/Chat/Settings list). Hand-rolled
 * controlled component — same shape as `NavTabs`/`GroupSpaceSwitcher` (parent
 * owns `activeTab`), since no Radix Tabs primitive exists in this repo yet
 * (`client/CLAUDE.md`). Arrow-key navigation between tabs, matching this
 * app's other keyboard-accessible controls.
 */
export function GroupTabs({ activeTab, onChange }: GroupTabsProps) {
  const buttonRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // Roving-tabindex keyboard nav (WAI-ARIA tabs pattern) — selection AND DOM
  // focus both move together, so a second arrow-key press continues from
  // wherever focus actually landed rather than the original button.
  const handleKeyDown = (event: React.KeyboardEvent, index: number) => {
    let nextIndex: number | null = null;
    if (event.key === 'ArrowDown') nextIndex = (index + 1) % TABS.length;
    if (event.key === 'ArrowUp') nextIndex = (index - 1 + TABS.length) % TABS.length;
    if (event.key === 'Home') nextIndex = 0;
    if (event.key === 'End') nextIndex = TABS.length - 1;
    if (nextIndex !== null) {
      event.preventDefault();
      onChange(TABS[nextIndex].key);
      buttonRefs.current[nextIndex]?.focus();
    }
  };

  return (
    <div
      role="tablist"
      aria-orientation="vertical"
      aria-label="Group sections"
      className="flex w-37.5 shrink-0 flex-col gap-0.5"
    >
      {TABS.map((tab, index) => {
        const isActive = tab.key === activeTab;
        return (
          <button
            key={tab.key}
            ref={(el) => {
              buttonRefs.current[index] = el;
            }}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(tab.key)}
            onKeyDown={(event) => handleKeyDown(event, index)}
            className={cn(
              'flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-left text-2sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-accent',
              isActive
                ? 'bg-bg-accent font-medium text-text-accent'
                : 'text-text-secondary hover:bg-surface-1',
            )}
          >
            <tab.Icon className="size-4" aria-hidden="true" />
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
