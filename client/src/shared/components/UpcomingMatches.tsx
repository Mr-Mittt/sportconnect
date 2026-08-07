import { IconClock, IconCoin, IconMapPin } from '@tabler/icons-react';
import { createElement } from 'react';
import { sportKeyForId } from '@/features/feed/sportIdMap';
import { formatFeeDisplay } from '@/shared/lib/feeType';
import { getRampBadgeClasses } from '@/shared/lib/rampStyles';
import { formatParticipantCount } from '@/shared/lib/sessionCapacity';
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
  onSeeAll: () => void;
  onSelectMatch: (sessionId: number) => void;
  /** CLIENT-SESSION-7: empty-state-only CTAs (see the empty-state branch below) — opens the
   * hosting page's create-session modal / Discover modal. Kept as separate props (not literally
   * `onSeeAll` reused) so each can point somewhere more specific than the populated list does. */
  onCreateMatch: () => void;
  onJoinMatch: () => void;
  /**
   * Max matches rendered after the sport filter; the rest live behind
   * "See all" (cap of 4 decided on the HF-4 backlog entry — the epic left it open).
   */
  maxVisible?: number;
}

/**
 * Right-rail card listing the user's upcoming sessions, filtered by the same
 * activeSport as the Feed (HF-7 shares the state). Presentational: the single
 * "View details" CTA only reports the session via onSelectMatch — join/leave/
 * cancel live in the Matches page's detail dialog, not here (CLIENT-SESSION-1:
 * cheaply knowing "have I joined" per card isn't available without fetching
 * each session's participants, so this card shows a status badge instead of a
 * join button).
 *
 * CLIENT-SESSION-7: the empty state (only, not the populated list) also
 * renders "Create a match"/"Join a match" CTAs — the hosting page decides
 * what they open (a create-session modal, a discover modal).
 */
export function UpcomingMatches({
  matches,
  activeSport,
  sportsByKey,
  onSeeAll,
  onSelectMatch,
  onCreateMatch,
  onJoinMatch,
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
            return (
              <div key={match.id} className="border-hairline rounded-lg border-border p-2.5">
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
                  <div className="text-xs font-medium leading-snug text-text-primary">{title}</div>
                  <span
                    className={cn(
                      'ml-auto shrink-0 text-2xs font-medium',
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
                <div className="mb-2 flex items-center gap-2 text-2xs text-text-secondary">
                  <span className="flex items-center gap-1">
                    <IconCoin className="size-3 shrink-0" aria-hidden="true" />
                    {formatFeeDisplay(match.feeType, match.feeAmountVnd)}
                  </span>
                  <span>{formatParticipantCount(match.participantCount, match.capacity)}</span>
                </div>
                <button
                  type="button"
                  // Three sibling cards would otherwise expose identical
                  // "View details" names to a screen reader
                  aria-label={`${title} — View details`}
                  onClick={() => onSelectMatch(match.id)}
                  className="border-hairline w-full cursor-pointer rounded-lg border-border-strong py-1.25 text-xs text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-accent"
                >
                  View details
                </button>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
