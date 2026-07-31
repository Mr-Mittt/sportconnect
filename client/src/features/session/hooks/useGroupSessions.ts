import { useQueries, useQuery } from '@tanstack/react-query';
import { apiClient } from '@/app/apiClient';
import { sessionKeys } from '../queryKeys';
import type { Session } from '@/shared/types/session';
import type { PagedApiResponse } from '@/features/feed/types';

async function fetchGroupSessions(groupId: number) {
  const response = await apiClient.get<PagedApiResponse<Session>>(`/sessions/group/${groupId}`);
  return response.data.data;
}

/** Wraps `GET /api/sessions/group/{groupId}` — private-group visibility is enforced backend-side. */
export function useGroupSessions(groupId: number, enabled: boolean) {
  return useQuery({
    queryKey: sessionKeys.group(groupId),
    queryFn: () => fetchGroupSessions(groupId),
    enabled,
  });
}

/**
 * Fans out `GET /api/sessions/group/{groupId}` across every group the caller belongs to —
 * there is no batch "sessions across my groups" endpoint (a real backend gap, flagged in
 * CLIENT-SESSION-1's implementation summary), so this is a parallel `useQueries` fetch, one
 * per group, sharing the same query key/fn (and cache) as `useGroupSessions` above. Used by
 * `useUpcomingSessions` (the rail card's data source) and the Matches page's aggregator.
 */
export function useGroupSessionsForGroups(groupIds: number[]) {
  return useQueries({
    queries: groupIds.map((groupId) => ({
      queryKey: sessionKeys.group(groupId),
      queryFn: () => fetchGroupSessions(groupId),
    })),
  });
}
