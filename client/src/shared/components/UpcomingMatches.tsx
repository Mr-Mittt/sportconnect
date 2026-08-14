import { IconClock, IconCoin, IconMapPin } from '@tabler/icons-react';
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
import { Button } from '@/shared/ui/button';
import type { SportKey, SportProfile } from '@/shared/types/sport';
import type { Session } from '@/shared/types/session';

interface UpcomingMatchesProps {
  matches: Session[];
  activeSport: SportKey | 'all';
  sportsByKey: Record<SportKey, SportProfile>;
  /** Post-ship: same "creator doesn't get the plain Leave action" rule as `SessionListCard`. */
  currentUserId: string;
  onSeeAll: () => void;
  /** Opens `SessionDetailModal` in place on the hosting page (not a navigation) — CLIENT-SESSION-9
   * follow-up: previously navigated to `/matches?session={id}`, switching the user away from
   * whatever page they were on. Each hosting page passes its own `discoverModalData.onViewDetails`. */
  onSelectMatch: (sessionId: number) => void;
  /** CLIENT-SESSION-7: empty-state-only CTAs (see the empty-state branch below) — opens the
   * hosting page's create-session modal / Discover modal. Kept as separate props (not literally
   * `onSeeAll` reused) so each can point somewhere more specific than the populated list does. */
  onCreateMatch: () => void;
  onJoinMatch: () => void;
  /** CLIENT-SESSION-9: the card's single participation action (Join/Accept/Cancel/Leave), same
   * derivation and same "Decline stays modal-only" scoping as `SessionListCard`'s own prop. */
  onParticipationAction: (sessionId: number, kind: ParticipationActionKind) => void;
  isParticipationActionPending: (sessionId: number) => boolean;
  /**
   * Max matches rendered after the sport filter; the rest live behind
   * "See all" (cap of 4 decided on the HF-4 backlog entry — the epic left it open).
   */
  maxVisible?: number;
}

/**
 * Right-rail card listing the user's upcoming sessions, filtered by the same
 * activeSport as the Feed (HF-7 shares the state).
 *
 * CLIENT-SESSION-9: each row has two sibling buttons — "View details" and its own participation
 * action, derived from `session.callerParticipation`. Previously only "View details" existed here
 * (CLIENT-SESSION-1: cheaply knowing "have I joined" per card wasn't available without fetching
 * each session's participants) — `callerParticipation` now makes that cheap. "View details"
 * originally navigated to `/matches?session={id}`; a same-day follow-up switched it to open
 * `SessionDetailModal` in place instead (via the hosting page's own `discoverModalData`), so
 * clicking it no longer switches the user away from Home Feed/Groups/Friends. The modal opened
 * this way never shows manager-only actions (Cancel session, approval queue) even for a session
 * the caller manages — same simplification `useDiscoverModalData` already made for its own
 * Discover-sourced sessions (`canManage` hardcoded `false`); those stay reachable only via the
 * Matches page (`onSeeAll`).
 *
 * CLIENT-SESSION-7: the empty state (only, not the populated list) also
 * renders "Create a match"/"Join a match" CTAs — the hosting page decides
 * what they open (a create-session modal, a discover modal).
 */
export function UpcomingMatches({
  matches,
  activeSport,
  sportsByKey,
  currentUserId,
  onSeeAll,
  onSelectMatch,
  onCreateMatch,
  onJoinMatch,
  onParticipationAction,
  isParticipationActionPending,
  maxVisible = 4,
}: UpcomingMatchesProps) {
  const filtered =
    activeSport === 'all'
      ? matches
      : matches.filter((match) => sportKeyForId(match.sportId) === activeSport);
  const visible = filtered.slice(0, maxVisible);

  return (
    <section
      aria-label="Upcoming matches"
      className="border-hairline rounded-xl border-border bg-surface-2 p-3.5"
    >
      <div className="mb-2.5 flex items-center justify-between">
        <h2 className="text-2sm font-medium text-text-primary">Upcoming</h2>
        <button
          type="button"
          onClick={onSeeAll}
          className="cursor-pointer rounded text-xs text-text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-accent"
        >
          See all
        </button>
      </div>

      {visible.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-2">
          <p className="text-xs text-text-muted">No upcoming matches.</p>
          <div className="flex w-full gap-2">
            <Button variant="primary" size="sm" className="flex-1" onClick={onJoinMatch}>
              Join a match
            </Button>
            <Button variant="outline" size="sm" className="flex-1" onClick={onCreateMatch}>
              Create a match
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {visible.map((match) => {
            // Real sportProfiles (SPORT-1) doesn't guarantee coverage of every
            // session's sport the way the old always-3-sport mock did — same
            // "render without a badge rather than crash" fallback PostCard uses
            // for an unresolved SportProfile.
            const sportKey = sportKeyForId(match.sportId);
            const sport = sportKey !== undefined ? sportsByKey[sportKey] : undefined;
            const title = match.title ?? `${match.sportName} session`;
            const action = getParticipationAction(match);
            const isActionPending = isParticipationActionPending(match.id);
            // Same "creator doesn't get the plain Leave action" rule as SessionListCard.
            const isLeaveHiddenForCreator = action?.kind === 'LEAVE' && match.createdBy === currentUserId;
            // Mouse-only convenience on top of the explicit, fully keyboard-accessible "View
            // details" button below — same reasoning as SessionListCard's own card-click handler.
            return (
              // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions
              <div
                key={match.id}
                className="border-hairline rounded-lg border-border p-2.5"
                onClick={() => onSelectMatch(match.id)}
              >
                <div className="mb-1 flex items-center gap-1.5">
                  {sport !== undefined && (
                    <span
                      className={cn(
                        'flex size-5.5 shrink-0 items-center justify-center rounded-full',
                        getRampBadgeClasses(sport.colorRamp),
                      )}
                    >
                      {/* createElement keeps the lookup out of a capitalized render-local,
                          which react-hooks/static-components would flag as a new component */}
                      {createElement(getSportIcon(sport.icon), {
                        className: 'size-3',
                        'aria-hidden': true,
                      })}
                    </span>
                  )}
                  <div
                    className="min-w-0 flex-1 truncate text-xs font-medium leading-snug text-text-primary"
                    title={title}
                  >
                    {title}
                  </div>
                  <span
                    className={cn(
                      'shrink-0 text-2xs font-medium',
                      SESSION_STATUS_CLASSES[match.status],
                    )}
                  >
                    {SESSION_STATUS_LABEL[match.status]}
                  </span>
                </div>
                <div className="mb-0.5 flex items-center gap-1 text-2xs text-text-secondary">
                  <IconClock className="size-3 shrink-0" aria-hidden="true" />
                  {formatStartTime(match.scheduledStart)}
                </div>
                <div className="mb-0.5 flex items-center gap-1 text-2xs text-text-secondary">
                  <IconMapPin className="size-3 shrink-0" aria-hidden="true" />
                  {match.location.name}
                </div>
                <div className="mb-2 flex items-center justify-between gap-2 text-2xs text-text-secondary">
                  <span className="flex items-center gap-1">
                    <IconCoin className="size-3 shrink-0" aria-hidden="true" />
                    {formatFeeDisplay(match.feeType, match.feeAmountVnd)}
                  </span>
                  <span>{formatParticipantCount(match.participantCount, match.capacity)}</span>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    // Three sibling cards would otherwise expose identical
                    // "View details" names to a screen reader
                    aria-label={`${title} — View details`}
                    onClick={(event) => {
                      event.stopPropagation();
                      onSelectMatch(match.id);
                    }}
                    className="border-hairline flex-1 cursor-pointer rounded-lg border-border-strong py-1.25 text-xs text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-accent"
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
                        onParticipationAction(match.id, action.kind);
                      }}
                      className="border-hairline flex-1 cursor-pointer rounded-lg border-border-strong py-1.25 text-xs text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-accent disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isActionPending ? 'Working…' : action.label}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
