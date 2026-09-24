import { SessionCard } from '@/shared/components/SessionCard';
import type { ParticipationActionKind } from '@/shared/lib/sessionParticipation';
import type { SportKey, SportProfile } from '@/shared/types/sport';
import type { SessionListItem } from '../types';
import { LoadMoreButton } from './LoadMoreButton';

interface DiscoverResultsListProps {
  sessions: SessionListItem[];
  isLoading: boolean;
  isError: boolean;
  hasMore: boolean;
  isFetchingMore: boolean;
  onLoadMore: () => void;
  /** Empty-state copy varies by caller ("No sessions to discover on Today." for a date section,
   * a simpler "No sessions to discover today." for the modal's flat list) — passed in rather than
   * derived, since only the caller knows which shape it is. */
  emptyMessage: string;
  errorMessage: string;
  sportsByKey: Record<SportKey, SportProfile>;
  currentUserId: string;
  onViewDetails: (sessionId: number) => void;
  onParticipationAction: (sessionId: number, kind: ParticipationActionKind) => void;
  isParticipationActionPending: (sessionId: number) => boolean;
  gridClassName: string;
}

/**
 * CLIENT-SESSION-22 — the loading/error/empty/grid/load-more block shared by `DiscoverDateSection`
 * (wraps this in the full `/matches` page's collapsible per-date header) and
 * `SessionDiscoverModal`'s own flat, today-only list (CLIENT-SESSION-22 delta, 2026-09-22 — no
 * header, no date, just this). Nothing is fetched here — all state passed down, per
 * `client/CLAUDE.md`'s presentational-and-controlled rule.
 */
export function DiscoverResultsList({
  sessions,
  isLoading,
  isError,
  hasMore,
  isFetchingMore,
  onLoadMore,
  emptyMessage,
  errorMessage,
  sportsByKey,
  currentUserId,
  onViewDetails,
  onParticipationAction,
  isParticipationActionPending,
  gridClassName,
}: DiscoverResultsListProps) {
  return (
    <div className="flex flex-col gap-3">
      {isLoading && <p className="text-2sm text-text-muted">Loading…</p>}
      {isError && (
        <p role="alert" className="text-2sm text-text-danger">
          {errorMessage}
        </p>
      )}
      {!isLoading && !isError && sessions.length === 0 && (
        <p className="text-2sm text-text-muted">{emptyMessage}</p>
      )}
      {!isLoading && !isError && sessions.length > 0 && (
        <div className={gridClassName}>
          {sessions.map((session) => (
            <SessionCard
              key={session.id}
              session={session}
              sportsByKey={sportsByKey}
              currentUserId={currentUserId}
              onViewDetails={onViewDetails}
              onParticipationAction={onParticipationAction}
              isParticipationActionPending={isParticipationActionPending}
            />
          ))}
        </div>
      )}
      {!isLoading && !isError && hasMore && (
        <LoadMoreButton isFetching={isFetchingMore} onClick={onLoadMore} />
      )}
      {/* 2026-09-23 revision — previously rendered nothing once the last page loaded, giving no
        confirmation the list had actually ended vs. just not being re-checked. */}
      {!isLoading && !isError && !hasMore && sessions.length > 0 && (
        <p className="self-center text-2xs text-text-muted">No more to load.</p>
      )}
    </div>
  );
}
