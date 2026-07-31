import { useMemo } from 'react';
import { useAuthStore } from '@/app/authStore';
import { useUserGroups } from '@/features/feed/hooks/useUserGroups';
import { useGroupSessionsForGroups } from '@/features/session/hooks/useGroupSessions';
import { useMySessions } from '@/features/session/hooks/useMySessions';
import type { Session } from '@/shared/types/session';

/**
 * CLIENT-SESSION-1: real hook against `modules/session` (`features/session/hooks/*`),
 * replacing the mock array that used to live here. Same `{ data, isLoading, isError }` shape as
 * before (client/CLAUDE.md's data layer convention) — `UpcomingMatches`, `HomeFeedPage`,
 * `GroupsPage`, and `FriendsPage` don't change their own call shape.
 *
 * There is no batch "sessions across my groups" endpoint (a real backend gap — see
 * `client/docs/CLIENT-SESSION-1_SESSION_UI.md`), so this fans out one query per group the
 * caller belongs to (`useGroupSessionsForGroups`, `useQueries`) and merges with the caller's
 * own standalone sessions (`useMySessions` — `GET /sessions/mine` only returns sessions the
 * caller *created*, not ones they joined; another flagged gap, not solved here). `COMPLETED`/
 * `CANCELLED` sessions are dropped — this is the "Upcoming" rail, not a full history — and the
 * rest are sorted by `scheduledStart` ascending. `UpcomingMatches` itself still applies its own
 * `maxVisible` cap on top of this.
 */
export function useUpcomingMatches(): {
  data: Session[];
  isLoading: boolean;
  isError: boolean;
} {
  const userId = useAuthStore((state) => state.user?.id);
  const groupsQuery = useUserGroups(userId);
  const groupIds = useMemo(
    () => (groupsQuery.data?.content ?? []).map((group) => group.id),
    [groupsQuery.data],
  );
  const groupSessionQueries = useGroupSessionsForGroups(groupIds);
  const mySessionsQuery = useMySessions(userId !== undefined);

  const data = useMemo<Session[]>(() => {
    const fromGroups = groupSessionQueries.flatMap((query) => query.data?.content ?? []);
    const mine = mySessionsQuery.data?.content ?? [];
    return [...fromGroups, ...mine]
      .filter((session) => session.status === 'SCHEDULED' || session.status === 'ONGOING')
      .sort((a, b) => a.scheduledStart.localeCompare(b.scheduledStart));
  }, [groupSessionQueries, mySessionsQuery.data]);

  return {
    data,
    isLoading:
      groupsQuery.isLoading || mySessionsQuery.isLoading || groupSessionQueries.some((query) => query.isLoading),
    isError:
      groupsQuery.isError || mySessionsQuery.isError || groupSessionQueries.some((query) => query.isError),
  };
}
