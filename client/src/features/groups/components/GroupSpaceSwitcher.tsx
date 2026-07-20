import { getRampBadgeClasses } from '@/shared/lib/rampStyles';
import { cn } from '@/shared/lib/utils';
import { Skeleton } from '@/shared/ui/skeleton';
import type { SportKey, SportProfile } from '@/shared/types/sport';
import { sportKeyForId } from '@/features/feed/sportIdMap';
import type { Group } from '@/features/feed/types';

interface GroupSpaceSwitcherProps {
  /** Caller pre-filters to the shared feedSpaceStore's activeSport — a group
   * is 1:1 with a sport, so this bounds the pill row to a handful of groups
   * instead of the user's full (unbounded) group list. */
  groups: Group[];
  /** null = "All" (the aggregate view — no single group to post into). */
  selectedGroupId: number | null;
  /** `groupSportId` (the selected group's own sport) lets the shared
   * feedSpaceStore decide whether this selection is still valid the next
   * time the sport filter changes — omit/undefined when selecting "All". */
  onSelect: (groupId: number | null, groupSportId?: number) => void;
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

/**
 * Groups page's space switcher (FEED-4) — "All" plus one pill per joined
 * group for the active sport (groups are 1:1 with a sport, so this list is
 * naturally small: same reasoning as SportSwitcher's own bounded pill row,
 * just derived from membership instead of a hard cap). Each group's pill
 * badge is colored via its own sport's ramp (`sportsByKey`), not a
 * group-specific color — groups don't carry one.
 *
 * Pure group selector — no Join/Create affordance of its own. FEED-5
 * originally added dashed "Join Group"/"Create Group" pills here (empty
 * state) collapsing into a "..." dropdown once populated; **removed in
 * GRP-1** once `GroupDiscoveryPanel` shipped with its own Join/Create entry
 * points (a shared "Group name or invite code" input plus both buttons,
 * matching `design-reference-group-feed.html`'s `group-switcher`, which
 * never had Join/Create built into it either). Keeping both would put two
 * identically-labeled "Join Group"/"Create Group" buttons on screen at
 * once whenever "All" is selected — confirmed as a real, confusing
 * duplication during live verification, not just a naming nit.
 *
 * FEED-8: `isLoading`/`isError` gate the "0 groups" pill-only fallback — a
 * still-loading or failed fetch must not render the same bare "All" pill a
 * genuinely empty group list would (that would read as "you have no
 * groups" when the real state is "we don't know yet"/"couldn't check").
 */
export function GroupSpaceSwitcher({
  groups,
  selectedGroupId,
  onSelect,
  sportsByKey,
  isLoading,
  isError,
  onRetry,
}: GroupSpaceSwitcherProps) {
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
            onClick={() => onSelect(group.id, group.sportId)}
            badgeClassName={getRampBadgeClasses(ramp ?? '')}
            badgeContent={initialsFor(group.groupName)}
          />
        );
      })}
    </div>
  );
}
