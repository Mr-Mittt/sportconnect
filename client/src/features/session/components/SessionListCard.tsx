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
  /** Post-ship: a JOINED creator never gets the card's own Leave action either — same rule
   * `SessionDetailModal` already applies, kept consistent here. */
  currentUserId: string;
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
 *
 * Post-ship: the card itself also opens the detail view on click — a mouse-only convenience, not
 * a replacement for the explicit "View details" button (which stays, both for keyboard/screen-
 * reader users and because the card can't itself be `role="button"` while it contains real nested
 * `<button>`s — interactive-inside-interactive is invalid ARIA). The two inner buttons stop
 * propagation so clicking either doesn't also fire the card's own click.
 */
export function SessionListCard({
  session,
  sportsByKey,
  currentUserId,
  onViewDetails,
  onParticipationAction,
  isParticipationActionPending,
}: SessionListCardProps) {
  const sportKey = sportKeyForId(session.sportId);
  const sport = sportKey !== undefined ? sportsByKey[sportKey] : undefined;
  const title = session.title ?? `${session.sportName} session`;
  const action = getParticipationAction(session);
  const isActionPending = isParticipationActionPending(session.id);
  // Same "creator doesn't get the plain Leave action" rule as SessionDetailModal.
  const isLeaveHiddenForCreator = action?.kind === 'LEAVE' && session.createdBy === currentUserId;

  // Mouse-only convenience on top of the explicit, fully keyboard-accessible "View details"
  // button below — deliberately not role="button"/tabIndex on the wrapper: this card contains
  // real nested <button>s, and making the wrapper itself a focusable/interactive-role element
  // would create invalid interactive-inside-interactive ARIA nesting, a worse a11y problem than
  // the one these two rules normally catch.
  return (
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions
    <div
      className="border-hairline flex w-full flex-col gap-1.5 rounded-xl border-border bg-surface-2 p-3.5 text-left"
      onClick={() => onViewDetails(session.id)}
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
        <div className="min-w-0 flex-1 truncate text-sm font-medium text-text-primary" title={title}>
          {title}
        </div>
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

      <div className="flex items-center justify-between gap-2 text-2xs text-text-muted">
        <div className="flex items-center gap-1">
          <IconCoin className="size-3.5 shrink-0" aria-hidden="true" />
          {formatFeeDisplay(session.feeType, session.feeAmountVnd)}
        </div>
        <div className="flex items-center gap-1">
          <IconUsers className="size-3.5 shrink-0" aria-hidden="true" />
          {formatParticipantCount(session.participantCount, session.capacity)}
        </div>
      </div>

      <div className="mt-1 flex gap-2">
        <button
          type="button"
          aria-label={`${title} — View details`}
          onClick={(event) => {
            event.stopPropagation();
            onViewDetails(session.id);
          }}
          className={ACTION_BUTTON_CLASSES}
        >
          View details
        </button>
        {action !== null && !isLeaveHiddenForCreator && (
          <button
            type="button"
            aria-label={`${title} — ${action.label}`}
            disabled={isActionPending}
            onClick={(event) => {
              event.stopPropagation();
              onParticipationAction(session.id, action.kind);
            }}
            className={ACTION_BUTTON_CLASSES}
          >
            {isActionPending ? 'Working…' : action.label}
          </button>
        )}
      </div>
    </div>
  );
}
