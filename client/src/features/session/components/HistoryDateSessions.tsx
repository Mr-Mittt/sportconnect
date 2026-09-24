import { SessionCard } from '@/shared/components/SessionCard';
import type { ParticipationActionKind } from '@/shared/lib/sessionParticipation';
import type { SportKey, SportProfile } from '@/shared/types/sport';
import { useHistoryDateSessions } from '../hooks/useHistoryDateSessions';
import { LoadMoreButton } from './LoadMoreButton';

interface HistoryDateSessionsProps {
  /** `yyyy-MM-dd` — the history date whose sessions to fetch. */
  date: string;
  /** Already-formatted row label ("Sep 14, 2026" / "Today"), only used to name the nested
   * "Load more" button so several expanded dates stay distinguishable to a screen reader. */
  dateLabel: string;
  sportId: number;
  sportsByKey: Record<SportKey, SportProfile>;
  currentUserId: string;
  onViewDetails: (sessionId: number) => void;
  onParticipationAction: (sessionId: number, kind: ParticipationActionKind) => void;
  isParticipationActionPending: (sessionId: number) => boolean;
}

/**
 * CLIENT-SESSION-23 — one expanded History date's session list (`GET /sessions/history?date=`,
 * paginated 20 at a time; a single date with more than 20 sessions gets a nested "Load more").
 *
 * **The one connected component in the History section — a deliberate, narrow exception to
 * `client/CLAUDE.md`'s "components are presentational" rule.** Every other piece of History state
 * comes from `useMatchesPageData`, but this fetch can't: the number of date rows is unbounded (20
 * per page, growing with each "Load more"), and TanStack Query has no infinite-query counterpart
 * of `useQueries` — so `useDiscoverDateSections`' unrolled fixed-slot trick (8 dates, its hard
 * cap) doesn't scale here. Instead `HistorySection` mounts this only while a row is expanded, and
 * mounting *is* the laziness (no `enabled` flag to juggle). Collapsing unmounts it but leaves the
 * data in TanStack Query's cache, so re-expanding is a network no-op until stale.
 */
export function HistoryDateSessions({
  date,
  dateLabel,
  sportId,
  sportsByKey,
  currentUserId,
  onViewDetails,
  onParticipationAction,
  isParticipationActionPending,
}: HistoryDateSessionsProps) {
  const query = useHistoryDateSessions(date, sportId);
  const sessions = (query.data?.pages ?? []).flatMap((page) => page.content);

  return (
    <div className="flex flex-col gap-3">
      {query.isLoading && <p className="text-2sm text-text-muted">Loading…</p>}
      {query.isError && (
        <p role="alert" className="text-2sm text-text-danger">
          Couldn't load these sessions.
        </p>
      )}
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
      {!query.isLoading && !query.isError && query.hasNextPage && (
        <LoadMoreButton
          isFetching={query.isFetchingNextPage}
          onClick={() => void query.fetchNextPage()}
          ariaLabel={`Load more sessions for ${dateLabel}`}
        />
      )}
    </div>
  );
}
