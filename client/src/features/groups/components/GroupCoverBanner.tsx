import { IconArrowLeft } from '@tabler/icons-react';
import { createElement } from 'react';
import type { Group } from '@/features/feed/types';
import { getRampBadgeClasses } from '@/shared/lib/rampStyles';
import { getSportIcon } from '@/shared/lib/sportIcons';
import type { SportProfile } from '@/shared/types/sport';

interface GroupCoverBannerProps {
  group: Group;
  /** The group's own sport (looked up via `sportKeyForId(group.sportId)` by
   * the caller) — undefined falls back to neutral surface styling, same
   * fallback `getRampBadgeClasses` already has for an unknown ramp. */
  sport: SportProfile | undefined;
  onBack: () => void;
}

/**
 * Banner header shown above the group tabs whenever a specific group is
 * selected (matches `design-reference-group-feed.html`'s `#group-cover`) —
 * new, nothing like it exists in the page today. `group.coverUrl`, when set,
 * renders as the band's actual photo (the sport-ramp color stays underneath
 * as the `background-color`, so a slow/failed image load still shows a
 * reasonable fallback rather than a blank strip). Group's sport icon, name,
 * member count, and a way back to the "All groups" view (mirrors the
 * reference's `data-cover-back` button).
 */
export function GroupCoverBanner({ group, sport, onBack }: GroupCoverBannerProps) {
  const rampClasses = getRampBadgeClasses(sport?.colorRamp ?? '');

  return (
    <div className="border-hairline mb-3.5 overflow-hidden rounded-xl border-border bg-surface-2">
      <div className={`relative flex h-24 items-end overflow-hidden p-3.5 ${rampClasses}`}>
        {group.coverUrl !== null && (
          <img src={group.coverUrl} alt="" className="absolute inset-0 size-full object-cover" />
        )}
        <span className="shadow-card relative z-10 flex size-13 items-center justify-center rounded-xl bg-surface-2">
          {sport !== undefined ? (
            createElement(getSportIcon(sport.icon), { className: 'size-6.5', 'aria-hidden': true })
          ) : (
            <span className="text-lg font-semibold">{group.groupName.slice(0, 1).toUpperCase()}</span>
          )}
        </span>
      </div>
      <div className="flex items-center justify-between px-3.5 py-3">
        <div className="min-w-0">
          <div className="truncate text-base font-medium text-text-primary">{group.groupName}</div>
          <div className="text-2sm text-text-muted">{group.memberCount} members</div>
        </div>
        <button
          type="button"
          onClick={onBack}
          className="flex shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border-hairline border-border px-3 py-1.5 text-2sm text-text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-accent"
        >
          <IconArrowLeft className="size-4" aria-hidden="true" />
          All groups
        </button>
      </div>
    </div>
  );
}
