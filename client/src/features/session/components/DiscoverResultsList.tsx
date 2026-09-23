import { SessionCard } from '@/shared/components/SessionCard';
import type { ParticipationActionKind } from '@/shared/lib/sessionParticipation';
import type { SportKey, SportProfile } from '@/shared/types/sport';
import type { SessionListItem } from '../types';

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
      {hasMore && (
        <button
          type="button"
          onClick={onLoadMore}
          disabled={isFetchingMore}
          className="cursor-pointer self-center rounded-lg border-hairline border-border px-3 py-1.5 text-2xs font-medium text-text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-accent disabled:cursor-default disabled:opacity-60"
        >
          {isFetchingMore ? 'Loading…' : 'Load more sessions'}
        </button>
      )}
    </div>
  );
}
