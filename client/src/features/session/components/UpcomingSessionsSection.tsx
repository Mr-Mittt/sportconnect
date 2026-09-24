import type { ParticipationActionKind } from '@/shared/lib/sessionParticipation';
import type { SportKey, SportProfile } from '@/shared/types/sport';
import type { SessionDateGroup as SessionDateGroupData } from '../groupSessionsByDate';
import { LoadMoreButton } from './LoadMoreButton';
import { SessionDateGroup } from './SessionDateGroup';

interface UpcomingSessionsSectionProps {
  /** Already day-grouped (`groupSessionsByDate`), soonest day first. */
  groups: SessionDateGroupData[];
  isLoading: boolean;
  isError: boolean;
  hasMore: boolean;
  isFetchingMore: boolean;
  onLoadMore: () => void;
  collapsedDateKeys: ReadonlySet<string>;
  onToggleDateGroupCollapsed: (dateKey: string) => void;
  sportsByKey: Record<SportKey, SportProfile>;
  currentUserId: string;
  onViewDetails: (sessionId: number) => void;
  onParticipationAction: (sessionId: number, kind: ParticipationActionKind) => void;
  isParticipationActionPending: (sessionId: number) => boolean;
}

/**
 * CLIENT-SESSION-23 — the Matches page's "Upcoming sessions" section (`GET /sessions/upcoming`,
 * backend SESSION-27/43): the caller's `JOINED`/`INVITED` sessions in the active sport that are
 * still `PREPARING`/`SCHEDULED`/`ONGOING`, soonest first, under collapsible day headers
 * ("Today" / "Sep 20, 2026" — `SessionDateGroup`, reused from CLIENT-SESSION-6/20). One of the two
 * sections that replace the single "My sessions" list; independent of `HistorySection` — either can
 * be empty, loading, or errored while the other has content. Purely presentational: every piece of
 * state (including the day-group collapse set) comes from `useMatchesPageData`.
 */
export function UpcomingSessionsSection({
  groups,
  isLoading,
  isError,
  hasMore,
  isFetchingMore,
  onLoadMore,
  collapsedDateKeys,
  onToggleDateGroupCollapsed,
  sportsByKey,
  currentUserId,
  onViewDetails,
  onParticipationAction,
  isParticipationActionPending,
}: UpcomingSessionsSectionProps) {
  return (
    <section aria-label="Upcoming sessions" className="flex flex-col gap-3">
      <h2 className="text-2sm font-medium text-text-primary">Upcoming sessions</h2>

      {isLoading && <p className="text-2sm text-text-muted">Loading…</p>}
      {isError && (
        <p role="alert" className="text-2sm text-text-danger">
          Couldn't load your upcoming sessions.
        </p>
      )}
      {!isLoading && !isError && groups.length === 0 && (
        <p className="text-2sm text-text-muted">You have no upcoming sessions.</p>
      )}
      {groups.length > 0 && (
        <div className="flex flex-col gap-4">
          {groups.map((group) => (
            <SessionDateGroup
              key={group.dateKey}
              dateKey={group.dateKey}
              dateLabel={group.dateLabel}
              sessions={group.sessions}
              sportsByKey={sportsByKey}
              currentUserId={currentUserId}
              isCollapsed={collapsedDateKeys.has(group.dateKey)}
              onToggleCollapsed={onToggleDateGroupCollapsed}
              onViewDetails={onViewDetails}
              onParticipationAction={onParticipationAction}
              isParticipationActionPending={isParticipationActionPending}
            />
          ))}
        </div>
      )}
      {!isLoading && hasMore && <LoadMoreButton isFetching={isFetchingMore} onClick={onLoadMore} />}
    </section>
  );
}
