import { IconDots } from '@tabler/icons-react';
import { getRampBadgeClasses } from '@/shared/lib/rampStyles';
import { cn } from '@/shared/lib/utils';
import type { SportKey, SportProfile } from '@/shared/types/sport';
import { Button } from '@/shared/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu';
import { sportKeyForId } from '@/features/feed/sportIdMap';
import type { Group } from '@/features/feed/types';

interface GroupSpaceSwitcherProps {
  /** Caller pre-filters to the shared feedSpaceStore's activeSport — a group
   * is 1:1 with a sport, so this bounds the pill row to a handful of groups
   * instead of the user's full (unbounded) group list. */
  groups: Group[];
  /** null = "All" (the aggregate view — no single group to post into). */
  selectedGroupId: number | null;
  onSelect: (groupId: number | null) => void;
  onCreateGroup: () => void;
  onJoinGroup: () => void;
  sportsByKey: Record<SportKey, SportProfile>;
}

function initialsFor(groupName: string): string {
  return groupName
    .split(' ')
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

interface PillProps {
  label: string;
  isActive: boolean;
  onClick: () => void;
  badgeClassName?: string;
  badgeContent?: string;
}

function Pill({ label, isActive, onClick, badgeClassName, badgeContent }: PillProps) {
  return (
    <button
      type="button"
      aria-pressed={isActive}
      onClick={onClick}
      className={cn(
        'flex cursor-pointer items-center gap-1.5 rounded-full bg-surface-1 px-3 py-1.75 text-2sm text-text-primary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface-0',
        isActive ? 'border-2 border-border-accent font-medium' : 'border-hairline border-border',
      )}
    >
      {badgeContent !== undefined && (
        <span
          className={cn(
            'flex size-4.5 shrink-0 items-center justify-center rounded-full text-[9px] font-medium',
            badgeClassName,
          )}
        >
          {badgeContent}
        </span>
      )}
      {label}
    </button>
  );
}

/**
 * Groups page's space switcher (FEED-4) — "All" plus one pill per joined
 * group for the active sport (groups are 1:1 with a sport, so this list is
 * naturally small: same reasoning as SportSwitcher's own bounded pill row,
 * just derived from membership instead of a hard cap). Each group's pill
 * badge is colored via its own sport's ramp (`sportsByKey`), not a
 * group-specific color — groups don't carry one.
 *
 * Join/Create are always available, but collapse based on membership (user
 * decision): zero joined groups for this sport renders them as prominent
 * buttons (there's nothing else to show); one or more renders the pill row
 * and tucks both actions into a right-aligned "..." menu instead, since
 * they're secondary once the user already has groups to switch between.
 * Both remain no-ops until FEED-5 wires the real modals.
 */
export function GroupSpaceSwitcher({
  groups,
  selectedGroupId,
  onSelect,
  onCreateGroup,
  onJoinGroup,
  sportsByKey,
}: GroupSpaceSwitcherProps) {
  const hasGroups = groups.length > 0;

  return (
    <div role="group" aria-label="Group filter" className="flex flex-wrap items-center gap-2">
      <Pill label="All" isActive={selectedGroupId === null} onClick={() => onSelect(null)} />

      {groups.map((group) => {
        const sportKey = sportKeyForId(group.sportId);
        const ramp = sportKey !== undefined ? sportsByKey[sportKey]?.colorRamp : undefined;
        return (
          <Pill
            key={group.id}
            label={group.groupName}
            isActive={selectedGroupId === group.id}
            onClick={() => onSelect(group.id)}
            badgeClassName={getRampBadgeClasses(ramp ?? '')}
            badgeContent={initialsFor(group.groupName)}
          />
        );
      })}

      {!hasGroups && (
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={onJoinGroup}>
            Join Group
          </Button>
          <Button variant="outline" size="sm" onClick={onCreateGroup}>
            Create Group
          </Button>
        </div>
      )}

      {hasGroups && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label="Group options"
              className="ml-auto cursor-pointer rounded p-1.5 text-text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-accent"
            >
              <IconDots className="size-4" aria-hidden="true" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem onSelect={onJoinGroup}>Join Group</DropdownMenuItem>
            <DropdownMenuItem onSelect={onCreateGroup}>Create Group</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}
