import { IconClock, IconCoin, IconMapPin, IconUsers } from '@tabler/icons-react';
import { sportKeyForId } from '@/features/feed/sportIdMap';
import { formatFeeDisplay } from '@/shared/lib/feeType';
import { getRampBadgeClasses } from '@/shared/lib/rampStyles';
import { formatParticipantCount } from '@/shared/lib/sessionCapacity';
import type { ParticipationActionKind } from '@/shared/lib/sessionParticipation';
import { getParticipationAction } from '@/shared/lib/sessionParticipation';
import { SESSION_STATUS_CLASSES, SESSION_STATUS_LABEL } from '@/shared/lib/sessionStatus';
import { formatStartTime } from '@/shared/lib/startTime';
import { cn } from '@/shared/lib/utils';
import type { SportKey, SportProfile } from '@/shared/types/sport';
import type { Session } from '@/shared/types/session';
import { SportIcon } from './SportIcon';

interface SessionCardProps {
  session: Session;
  sportsByKey: Record<SportKey, SportProfile>;
  /** Post-ship: a JOINED creator never gets the card's own Leave action either — same rule
   * `SessionDetailModal` already applies. */
  currentUserId: string;
  onViewDetails: (sessionId: number) => void;
  /** CLIENT-SESSION-9: the card's single participation action (Join/Accept/Cancel/Leave),
   * derived from `session.callerParticipation` via `getParticipationAction` — hidden when that
   * returns null. INVITED shows "Accept" only; "Decline" is only available in
   * `SessionDetailModal` (kept off the card — a 3rd button was too cramped at either size). */
  onParticipationAction: (sessionId: number, kind: ParticipationActionKind) => void;
  isParticipationActionPending: (sessionId: number) => boolean;
  /** 'full' (default) is the Matches page's list/Discover-grid card; 'compact' is the right-rail
   * row (`UpcomingMatches`). Same content and behavior at both sizes — this only changes spacing/
   * icon/text sizing, never what's shown. */
  size?: 'compact' | 'full';
}

const ACTION_BUTTON_CLASSES =
  'border-hairline flex-1 cursor-pointer rounded-lg border-border-strong py-1.25 text-xs text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-accent disabled:cursor-not-allowed disabled:opacity-60';

/**
 * CLIENT-SESSION-11: per-size class sets, one entry per JSX slot that differs between the two
 * contexts this card renders in — reproduces `UpcomingMatches`' old inline row and
 * `SessionListCard` exactly (same pixel spacing/colors each already had), not a new design.
 */
const SIZE_STYLES = {
  compact: {
    wrapper: 'border-hairline rounded-lg border-border p-2.5',
    header: 'mb-1 flex items-center gap-1.5',
    badge: 'flex size-5.5 shrink-0 items-center justify-center rounded-full',
    icon: 'size-3',
    title: 'min-w-0 flex-1 truncate text-xs font-medium leading-snug text-text-primary',
    detailRow: 'mb-0.5 flex items-center gap-1 text-2xs text-text-secondary',
    detailIcon: 'size-3 shrink-0',
    feeRow: 'mb-2 flex items-center justify-between gap-2 text-2xs text-text-secondary',
    showParticipantIcon: false,
    actionsRow: 'flex gap-2',
  },
  full: {
    wrapper:
      'border-hairline flex w-full flex-col gap-1.5 rounded-xl border-border bg-surface-2 p-3.5 text-left',
    header: 'flex items-center gap-2',
    badge: 'flex size-6 shrink-0 items-center justify-center rounded-full',
    icon: 'size-3.5',
    title: 'min-w-0 flex-1 truncate text-sm font-medium text-text-primary',
    detailRow: 'flex items-center gap-1 text-2xs text-text-secondary',
    detailIcon: 'size-3.5 shrink-0',
    feeRow: 'flex items-center justify-between gap-2 text-2xs text-text-muted',
    showParticipantIcon: true,
    actionsRow: 'mt-1 flex gap-2',
  },
} as const;

/**
 * CLIENT-SESSION-11: one card, two sizes — de-dupes what used to be `UpcomingMatches`' own inline
 * row JSX (right rail) and `features/session/components/SessionListCard.tsx` (Matches page's
 * date-grouped list + Discover grid), which had drifted into two hand-kept-in-line
 * implementations of the same content (CLIENT-SESSION-10's "brought in line for consistency"
 * pass). Moved to `shared/` since the rail (`UpcomingMatches`, already shared/cross-page) needs
 * it too — not scoped to `features/session/` alone anymore.
 *
 * Mouse-only convenience on top of the explicit, fully keyboard-accessible "View details" button:
 * the whole card opens details on click, but isn't itself `role="button"`/focusable — it contains
 * real nested `<button>`s, and making the wrapper interactive too would create invalid
 * interactive-inside-interactive ARIA nesting. Both inner buttons stop propagation so clicking
 * either doesn't also fire the card's own click.
 */
export function SessionCard({
  session,
  sportsByKey,
  currentUserId,
  onViewDetails,
  onParticipationAction,
  isParticipationActionPending,
  size = 'full',
}: SessionCardProps) {
  const s = SIZE_STYLES[size];
  const sportKey = sportKeyForId(session.sportId);
  const sport = sportKey !== undefined ? sportsByKey[sportKey] : undefined;
  const title = session.title ?? `${session.sportName} session`;
  const action = getParticipationAction(session);
  const isActionPending = isParticipationActionPending(session.id);
  const isLeaveHiddenForCreator = action?.kind === 'LEAVE' && session.createdBy === currentUserId;

  return (
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions
    <div className={s.wrapper} onClick={() => onViewDetails(session.id)}>
      <div className={s.header}>
        {sport !== undefined && (
          <span className={cn(s.badge, getRampBadgeClasses(sport.colorRamp))}>
            <SportIcon iconUrl={sport.iconUrl} className={s.icon} />
          </span>
        )}
        <div className={s.title} title={title}>
          {title}
        </div>
        <span className={cn('shrink-0 text-2xs font-medium', SESSION_STATUS_CLASSES[session.status])}>
          {SESSION_STATUS_LABEL[session.status]}
        </span>
      </div>

      <div className={s.detailRow}>
        <IconClock className={s.detailIcon} aria-hidden="true" />
        {formatStartTime(session.scheduledStart)}
      </div>

      <div className={s.detailRow}>
        <IconMapPin className={s.detailIcon} aria-hidden="true" />
        {session.location.name}
      </div>

      <div className={s.feeRow}>
        <div className="flex items-center gap-1">
          <IconCoin className={s.detailIcon} aria-hidden="true" />
          {formatFeeDisplay(session.feeType, session.feeAmountVnd)}
        </div>
        <div className="flex items-center gap-1">
          {s.showParticipantIcon && <IconUsers className={s.detailIcon} aria-hidden="true" />}
          {formatParticipantCount(session.participantCount, session.capacity)}
        </div>
      </div>

      <div className={s.actionsRow}>
        <button
          type="button"
          // Sibling cards would otherwise expose identical "View details" names to a screen reader.
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
