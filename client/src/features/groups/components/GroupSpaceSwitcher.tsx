import { IconDots, IconPlus, IconSearch } from '@tabler/icons-react';
import { getRampBadgeClasses } from '@/shared/lib/rampStyles';
import { cn } from '@/shared/lib/utils';
import { Skeleton } from '@/shared/ui/skeleton';
import type { SportKey, SportProfile } from '@/shared/types/sport';
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
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
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

interface DashedPillButtonProps {
  label: string;
  Icon: typeof IconPlus;
  onClick: () => void;
}

/** Same dashed "Add sport" pill style (SportSwitcher) — reused here (user
 * decision, FEED-5) so the zero-groups Join/Create actions read as the same
 * kind of affordance as adding a sport, not a generic button pair. */
function DashedPillButton({ label, Icon, onClick }: DashedPillButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="border-hairline flex cursor-pointer items-center gap-1.5 rounded-full border-dashed border-border-strong px-3 py-1.75 text-2sm text-text-secondary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface-0"
    >
      <Icon className="size-4" aria-hidden="true" />
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
 * dashed pills — same style as SportSwitcher's "Add sport" pill (FEED-5 user
 * decision), search/plus icons matching the modal each one opens; one or
 * more renders the pill row and tucks both actions into a right-aligned
 * "..." menu instead (same icons, plain menu-item styling), since they're
 * secondary once the user already has groups to switch between. Both open
 * the real CreateGroupModal/JoinGroupModal (FEED-5) via the callbacks below.
 *
 * FEED-8: `isLoading`/`isError` gate the "zero groups" fallback above — a
 * still-loading or failed fetch must not render the same dashed
 * Join/Create pills a genuinely empty group list would (that would read as
 * "you have no groups" when the real state is "we don't know yet"/"couldn't
 * check").
 */
export function GroupSpaceSwitcher({
  groups,
  selectedGroupId,
  onSelect,
  onCreateGroup,
  onJoinGroup,
  sportsByKey,
  isLoading,
  isError,
  onRetry,
}: GroupSpaceSwitcherProps) {
  const hasGroups = groups.length > 0;

  if (isLoading) {
    return (
      <div role="group" aria-label="Group filter" className="flex flex-wrap items-center gap-2">
        <Skeleton className="h-7.5 w-16 rounded-full" />
        <Skeleton className="h-7.5 w-28 rounded-full" />
        <Skeleton className="h-7.5 w-24 rounded-full" />
      </div>
    );
  }

  if (isError) {
    return (
      <div role="group" aria-label="Group filter" className="flex items-center gap-2">
        <p className="text-2sm text-text-danger">Couldn't load your groups.</p>
        <button
          type="button"
          onClick={onRetry}
          className="cursor-pointer rounded-lg border-hairline border-border px-2.5 py-1 text-2sm font-medium text-text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-accent"
        >
          Retry
        </button>
      </div>
    );
  }

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
        <>
          <DashedPillButton label="Join Group" Icon={IconSearch} onClick={onJoinGroup} />
          <DashedPillButton label="Create Group" Icon={IconPlus} onClick={onCreateGroup} />
        </>
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
            <DropdownMenuItem onSelect={onJoinGroup}>
              <IconSearch className="size-4" aria-hidden="true" />
              Join Group
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={onCreateGroup}>
              <IconPlus className="size-4" aria-hidden="true" />
              Create Group
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}
