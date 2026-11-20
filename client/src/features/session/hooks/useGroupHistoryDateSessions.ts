import { useInfiniteQuery } from '@tanstack/react-query';
import { apiClient } from '@/app/apiClient';
import { getNextPageParam } from '@/features/feed/pagination';
import type { PagedApiResponse } from '@/features/feed/types';
import { getViewerZoneId } from '@/shared/lib/viewerZone';
import type { Session, SessionStatus } from '@/shared/types/session';
import { statusParam } from '../groupSessionStatuses';
import { sessionKeys } from '../queryKeys';

export const GROUP_HISTORY_DATE_PAGE_SIZE = 20;

/**
 * Wraps `GET /api/sessions/group/{groupId}/history?date=&status=&viewerZoneId=&page=&size=` (SESSION-GROUP-12): one end date's
 * COMPLETED and/or CANCELLED sessions of the group, newest end first, 20 at a time. Called from a component that only mounts
 * while its date row is expanded (`GroupHistoryDateSessions`): mounting *is* the laziness, there is no `enabled` flag to juggle,
 * and the cache makes a collapse-then-expand free until stale. `viewerZoneId` is the one `useGroupHistoryDates` sent, so `date`
 * means the same day in both calls.
 */
export function useGroupHistoryDateSessions(groupId: number, date: string, statuses: readonly SessionStatus[]) {
  const viewerZoneId = getViewerZoneId();
  return useInfiniteQuery({
    queryKey: sessionKeys.groupHistoryDate(groupId, date, statuses, viewerZoneId),
    queryFn: async ({ pageParam }) => {
      const response = await apiClient.get<PagedApiResponse<Session>>(`/sessions/group/${groupId}/history`, {
        params: { date, status: statusParam(statuses), viewerZoneId, page: pageParam, size: GROUP_HISTORY_DATE_PAGE_SIZE },
      });
      return response.data.data;
    },
    initialPageParam: 0,
    getNextPageParam,
    retry: false,
  });
}
