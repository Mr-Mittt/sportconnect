import { IconClock, IconMapPin, IconUsers, IconUsersGroup } from '@tabler/icons-react';
import { createElement } from 'react';
import { sportKeyForId } from '@/features/feed/sportIdMap';
import { getRampBadgeClasses } from '@/shared/lib/rampStyles';
import { SESSION_STATUS_CLASSES, SESSION_STATUS_LABEL } from '@/shared/lib/sessionStatus';
import { getSportIcon } from '@/shared/lib/sportIcons';
import { formatStartTime } from '@/shared/lib/startTime';
import { cn } from '@/shared/lib/utils';
import type { SportKey, SportProfile } from '@/shared/types/sport';
import type { SessionListItem } from '../types';

interface SessionListCardProps {
  session: SessionListItem;
  sportsByKey: Record<SportKey, SportProfile>;
  onViewDetails: (sessionId: number) => void;
}

/**
 * The Matches page's full-list row — richer than the right-rail `UpcomingMatches` card (sport
 * badge, status badge, group name or "Standalone", date/time, location, participant count).
 * Presentational: a single "View details" CTA opens `SessionDetailModal`, where join/leave/
 * cancel actually live (CLIENT-SESSION-1 design decision — the real backend has no capacity
 * field and cheaply knowing "have I joined" per row isn't available without fetching each
 * session's participants).
 */
export function SessionListCard({ session, sportsByKey, onViewDetails }: SessionListCardProps) {
  const sportKey = sportKeyForId(session.sportId);
  const sport = sportKey !== undefined ? sportsByKey[sportKey] : undefined;
  const title = session.title ?? `${session.sportName} session`;

  return (
    <button
      type="button"
      onClick={() => onViewDetails(session.id)}
      className="border-hairline flex w-full flex-col gap-1.5 rounded-xl border-border bg-surface-2 p-3.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-accent"
    >
      <div className="flex items-center gap-2">
        {sport !== undefined && (
          <span
            className={cn(
              'flex size-6 shrink-0 items-center justify-center rounded-full',
              getRampBadgeClasses(sport.colorRamp),
            )}
          >
            {createElement(getSportIcon(sport.icon), { className: 'size-3.5', 'aria-hidden': true })}
          </span>
        )}
        <div className="min-w-0 flex-1 truncate text-sm font-medium text-text-primary">{title}</div>
        <span
          className={cn('shrink-0 text-2xs font-medium', SESSION_STATUS_CLASSES[session.status])}
        >
          {SESSION_STATUS_LABEL[session.status]}
        </span>
      </div>

      <div className="flex items-center gap-1 text-2xs text-text-secondary">
        <IconUsersGroup className="size-3.5 shrink-0" aria-hidden="true" />
        {session.groupName ?? 'Standalone'}
      </div>

      <div className="flex items-center gap-1 text-2xs text-text-secondary">
        <IconClock className="size-3.5 shrink-0" aria-hidden="true" />
        {formatStartTime(session.scheduledStart)}
      </div>

      <div className="flex items-center gap-1 text-2xs text-text-secondary">
        <IconMapPin className="size-3.5 shrink-0" aria-hidden="true" />
        {session.location.name}
      </div>

      <div className="flex items-center gap-1 text-2xs text-text-muted">
        <IconUsers className="size-3.5 shrink-0" aria-hidden="true" />
        {session.participantCount} {session.participantCount === 1 ? 'participant' : 'participants'}
      </div>
    </button>
  );
}
