import { sportKeyForId } from '@/features/feed/sportIdMap';
import type { ParticipationActionKind } from '@/shared/lib/sessionParticipation';
import { Button } from '@/shared/ui/button';
import type { SportKey, SportProfile } from '@/shared/types/sport';
import type { Session } from '@/shared/types/session';
import { SessionCard } from './SessionCard';

interface UpcomingMatchesProps {
  matches: Session[];
  activeSport: SportKey | 'all';
  sportsByKey: Record<SportKey, SportProfile>;
  /** Post-ship: same "creator doesn't get the plain Leave action" rule as `SessionCard`. */
  currentUserId: string;
  onSeeAll: () => void;
  /** Opens `SessionDetailModal` in place on the hosting page (not a navigation) — CLIENT-SESSION-9
   * follow-up: previously navigated to `/matches?session={id}`, switching the user away from
   * whatever page they were on. Each hosting page passes its own `discoverModalData.onViewDetails`. */
  onViewDetails: (sessionId: number) => void;
  /** CLIENT-SESSION-7: empty-state-only CTAs (see the empty-state branch below) — opens the
   * hosting page's create-session modal / Discover modal. Kept as separate props (not literally
   * `onSeeAll` reused) so each can point somewhere more specific than the populated list does. */
  onCreateMatch: () => void;
  onJoinMatch: () => void;
  /** CLIENT-SESSION-9: the card's single participation action (Join/Accept/Cancel/Leave), same
   * derivation and same "Decline stays modal-only" scoping as `SessionCard`'s own prop. */
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
 *
 * CLIENT-SESSION-11: each row is a `SessionCard` at `size="compact"` — this component keeps only
 * the rail-specific concerns (header, "See all", the sport-filter/cap, the empty state); the card
 * itself, its participation-action logic, and its "creator hides Leave" rule now live in one place
 * shared with the Matches page instead of being hand-kept-in-line here.
 */
export function UpcomingMatches({
  matches,
  activeSport,
  sportsByKey,
  currentUserId,
  onSeeAll,
  onViewDetails,
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
          {visible.map((match) => (
            <SessionCard
              key={match.id}
              size="compact"
              session={match}
              sportsByKey={sportsByKey}
              currentUserId={currentUserId}
              onViewDetails={onViewDetails}
              onParticipationAction={onParticipationAction}
              isParticipationActionPending={isParticipationActionPending}
            />
          ))}
        </div>
      )}
    </section>
  );
}
