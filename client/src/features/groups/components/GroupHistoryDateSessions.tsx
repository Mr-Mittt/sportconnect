import { LoadMoreButton } from '@/features/session/components/LoadMoreButton';
import { useGroupHistoryDateSessions } from '@/features/session/hooks/useGroupHistoryDateSessions';
import { SessionCard } from '@/shared/components/SessionCard';
import type { ParticipationActionKind } from '@/shared/lib/sessionParticipation';
import { useOverridableText } from '@/shared/lib/useOverridableText';
import type { SessionStatus } from '@/shared/types/session';
import type { SportKey, SportProfile } from '@/shared/types/sport';

interface GroupHistoryDateSessionsProps {
  /** i18next `"namespace:key.path"` prefix that overrides this component's copy (see `useOverridableText`). */
  i18nOverridePrefix?: string;
  groupId: number;
  /** `yyyy-MM-dd` — the end date whose sessions to fetch. */
  date: string;
  /** Already-formatted row label, only used to name the nested "Load more" so several expanded dates stay distinguishable. */
  dateLabel: string;
  statuses: readonly SessionStatus[];
  sportsByKey: Record<SportKey, SportProfile>;
  currentUserId: string;
  onViewDetails: (sessionId: number) => void;
  onParticipationAction: (sessionId: number, kind: ParticipationActionKind) => void;
  isParticipationActionPending: (sessionId: number) => boolean;
}

/**
 * CLIENT-GROUP-SESSION-2: one expanded History date's sessions of a group (`GET /sessions/group/{id}/history?date=`, 20 at a
 * time, newest end first). The one connected component of the history, a deliberate narrow exception to "components are
 * presentational", for the reason `HistoryDateSessions` (Matches) gives: the number of dates is unbounded, so each row fetches
 * its own list, and mounting only while the row is expanded *is* the laziness.
 */
export function GroupHistoryDateSessions({
  groupId,
  date,
  dateLabel,
  statuses,
  sportsByKey,
  currentUserId,
  onViewDetails,
  onParticipationAction,
  isParticipationActionPending,
  i18nOverridePrefix,
}: GroupHistoryDateSessionsProps) {
  const t = useOverridableText('groups', i18nOverridePrefix);
  const query = useGroupHistoryDateSessions(groupId, date, statuses);
  const sessions = (query.data?.pages ?? []).flatMap((page) => page.content);

  return (
    <div className="flex flex-col gap-3">
      {query.isLoading && <p className="text-2sm text-text-muted">{t('sessionsTab.loading')}</p>}
      {query.isError && (
        <p role="alert" className="text-2sm text-text-danger">
          {t('sessionsTab.history.dateError')}
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
          ariaLabel={t('sessionsTab.history.loadMoreForDate', { label: dateLabel })}
        />
      )}
    </div>
  );
}
