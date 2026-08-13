import { IconClock, IconCoin, IconMapPin, IconUsers } from '@tabler/icons-react';
import { createElement } from 'react';
import { sportKeyForId } from '@/features/feed/sportIdMap';
import { formatFeeDisplay } from '@/shared/lib/feeType';
import { getRampBadgeClasses } from '@/shared/lib/rampStyles';
import { formatParticipantCount } from '@/shared/lib/sessionCapacity';
import type { ParticipationActionKind } from '@/shared/lib/sessionParticipation';
import { getParticipationAction } from '@/shared/lib/sessionParticipation';
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
  /** CLIENT-SESSION-9: the card's single participation action (Join/Accept/Cancel/Leave),
   * derived from `session.callerParticipation` via `getParticipationAction` — hidden when that
   * returns null (session isn't SCHEDULED/ONGOING). INVITED shows "Accept" only; "Decline" is
   * only available in `SessionDetailModal` (kept off the card, user decision — a 3rd button was
   * too cramped on a compact card). */
  onParticipationAction: (sessionId: number, kind: ParticipationActionKind) => void;
  isParticipationActionPending: (sessionId: number) => boolean;
}

const ACTION_BUTTON_CLASSES =
  'border-hairline flex-1 cursor-pointer rounded-lg border-border-strong py-1.25 text-xs text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-accent disabled:cursor-not-allowed disabled:opacity-60';

/**
 * The Matches page's full-list row — richer than the right-rail `UpcomingMatches` card (sport
 * badge, status badge, date/time, location, participant count, fee). No session-type/group-name
 * row (user decision, CLIENT-SESSION-3) — `groupName` is resolved onto `SessionListItem` for
 * other consumers but not rendered here.
 *
 * CLIENT-SESSION-9: two sibling buttons — "View details" (opens `SessionDetailModal`, unchanged)
 * and the card's own participation action, when one applies. Previously this was a single
 * full-card button (CLIENT-SESSION-1 design decision — cheaply knowing "have I joined" per row
 * wasn't available without fetching each session's participants); `session.callerParticipation`
 * now makes that cheap, so the whole-card-is-one-button shape was retired. Both buttons carry
 * `${title} — …` aria-labels (same disambiguation pattern `UpcomingMatches` already used) since
 * the title itself renders as plain text outside either button now.
 */
export function SessionListCard({
  session,
  sportsByKey,
  onViewDetails,
  onParticipationAction,
  isParticipationActionPending,
}: SessionListCardProps) {
  const sportKey = sportKeyForId(session.sportId);
  const sport = sportKey !== undefined ? sportsByKey[sportKey] : undefined;
  const title = session.title ?? `${session.sportName} session`;
  const action = getParticipationAction(session);
  const isActionPending = isParticipationActionPending(session.id);

  return (
    <div className="border-hairline flex w-full flex-col gap-1.5 rounded-xl border-border bg-surface-2 p-3.5 text-left">
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
        <IconClock className="size-3.5 shrink-0" aria-hidden="true" />
        {formatStartTime(session.scheduledStart)}
      </div>

      <div className="flex items-center gap-1 text-2xs text-text-secondary">
        <IconMapPin className="size-3.5 shrink-0" aria-hidden="true" />
        {session.location.name}
      </div>

      <div className="flex items-center gap-1 text-2xs text-text-muted">
        <IconUsers className="size-3.5 shrink-0" aria-hidden="true" />
        {formatParticipantCount(session.participantCount, session.capacity)}
      </div>

      <div className="flex items-center gap-1 text-2xs text-text-muted">
        <IconCoin className="size-3.5 shrink-0" aria-hidden="true" />
        {formatFeeDisplay(session.feeType, session.feeAmountVnd)}
      </div>

      <div className="mt-1 flex gap-2">
        <button
          type="button"
          aria-label={`${title} — View details`}
          onClick={() => onViewDetails(session.id)}
          className={ACTION_BUTTON_CLASSES}
        >
          View details
        </button>
        {action !== null && (
          <button
            type="button"
            aria-label={`${title} — ${action.label}`}
            disabled={isActionPending}
            onClick={() => onParticipationAction(session.id, action.kind)}
            className={ACTION_BUTTON_CLASSES}
          >
            {isActionPending ? 'Working…' : action.label}
          </button>
        )}
      </div>
    </div>
  );
}
