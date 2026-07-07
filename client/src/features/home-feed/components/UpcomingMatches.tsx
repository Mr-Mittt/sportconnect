import { IconClock, IconMapPin } from '@tabler/icons-react';
import { createElement } from 'react';
import { getRampBadgeClasses } from '@/shared/lib/rampStyles';
import { getSportIcon } from '@/shared/lib/sportIcons';
import { formatStartTime } from '@/shared/lib/startTime';
import { cn } from '@/shared/lib/utils';
import type { SportKey, SportProfile } from '@/shared/types/sport';
import type { UpcomingMatch } from '../types';

interface UpcomingMatchesProps {
  matches: UpcomingMatch[];
  activeSport: SportKey | 'all';
  sportsByKey: Record<SportKey, SportProfile>;
  onSeeAll: () => void;
  onSelectMatch: (matchId: string) => void;
  /**
   * Max matches rendered after the sport filter; the rest live behind
   * "See all" (cap of 4 decided on the HF-4 backlog entry — the epic left it open).
   */
  maxVisible?: number;
}

/**
 * Right-rail card listing the user's upcoming matches, filtered by the same
 * activeSport as the Feed (HF-7 shares the state). Presentational: both CTA
 * variants ("N spots left, join" / "Full, view details") only report the match
 * via onSelectMatch — no join logic or destination screen exists in this MVP,
 * and the data stays mock throughout (no matches backend).
 */
export function UpcomingMatches({
  matches,
  activeSport,
  sportsByKey,
  onSeeAll,
  onSelectMatch,
  maxVisible = 4,
}: UpcomingMatchesProps) {
  const filtered =
    activeSport === 'all' ? matches : matches.filter((match) => match.sport === activeSport);
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
        <div className="py-2 text-xs text-text-muted">No upcoming matches for this sport.</div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {visible.map((match) => {
            const sport = sportsByKey[match.sport];
            const isFull = match.spotsLeft === 0;
            const ctaText = isFull
              ? 'Full, view details'
              : `${match.spotsLeft} spots left, join`;
            return (
              <div key={match.id} className="border-hairline rounded-lg border-border p-2.5">
                <div className="mb-1 flex items-center gap-1.5">
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
                  <div className="text-xs font-medium leading-snug text-text-primary">
                    {match.title}
                  </div>
                </div>
                <div className="mb-0.5 flex items-center gap-1 text-2xs text-text-secondary">
                  <IconClock className="size-3 shrink-0" aria-hidden="true" />
                  {formatStartTime(match.startsAt)}
                </div>
                <div className="mb-2 flex items-center gap-1 text-2xs text-text-secondary">
                  <IconMapPin className="size-3 shrink-0" aria-hidden="true" />
                  {match.location}
                </div>
                <button
                  type="button"
                  // Three sibling cards would otherwise expose identical
                  // "2 spots left, join" names to a screen reader
                  aria-label={`${match.title} — ${ctaText}`}
                  onClick={() => onSelectMatch(match.id)}
                  className={cn(
                    'border-hairline w-full cursor-pointer rounded-lg border-border-strong py-1.25 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-accent',
                    isFull ? 'text-text-muted' : 'text-text-primary',
                  )}
                >
                  {ctaText}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
