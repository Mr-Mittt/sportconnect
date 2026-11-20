import { useMemo } from 'react';
import { isSessionToday } from '@/shared/lib/sessionToday';
import type { Session } from '@/shared/types/session';
import { useGroupSessionBucket } from './hooks/useGroupSessionBucket';

/**
 * CLIENT-GROUP-SESSION-1: the data of the group Posts tab's "Today's session" shortcut. Today's sessions that are `ONGOING`,
 * then `SCHEDULED`, then `PREPARING` (drafts: owner, 2026-11-20; each bucket already comes soonest first), from the three
 * bucket calls of SESSION-GROUP-2. "Today" is read on the session's own wall clock and spans days: a session that started
 * yesterday and ends today or tomorrow is today's (`isSessionToday`). Never listed: `COMPLETED` and `CANCELLED` sessions (a
 * session leaves the list when it ends or is cancelled, the session writes invalidate every bucket). One page of each bucket is read, so more than a page of sessions in a status is cut off (a group has at most
 * 5 regular configurations a day plus its custom sessions).
 *
 * `isError` is true when either call failed; the shortcut then shows its retry line and keeps its "+" usable.
 */
export function useGroupSessionShortcutData(groupId: number | undefined, enabled: boolean) {
  const ongoingQuery = useGroupSessionBucket(groupId, 'ONGOING', enabled);
  const scheduledQuery = useGroupSessionBucket(groupId, 'SCHEDULED', enabled);
  const preparingQuery = useGroupSessionBucket(groupId, 'PREPARING', enabled);

  const sessions = useMemo<Session[]>(() => {
    const now = new Date();
    // The status check is a guard on top of the bucket: a session that ended or was cancelled never stays in the list.
    const today = (list: Session[] | undefined) =>
      (list ?? []).filter(
        (session) =>
          (session.status === 'ONGOING' || session.status === 'SCHEDULED' || session.status === 'PREPARING') &&
          isSessionToday(session, now),
      );
    const seen = new Set<number>();
    return [...today(ongoingQuery.data), ...today(scheduledQuery.data), ...today(preparingQuery.data)].filter((session) => {
      if (seen.has(session.id)) return false;
      seen.add(session.id);
      return true;
    });
  }, [ongoingQuery.data, scheduledQuery.data, preparingQuery.data]);

  return {
    sessions,
    isLoading: ongoingQuery.isLoading || scheduledQuery.isLoading || preparingQuery.isLoading,
    isError: ongoingQuery.isError || scheduledQuery.isError || preparingQuery.isError,
    retry: () => {
      if (ongoingQuery.isError) void ongoingQuery.refetch();
      if (scheduledQuery.isError) void scheduledQuery.refetch();
      if (preparingQuery.isError) void preparingQuery.refetch();
    },
  };
}
