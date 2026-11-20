import { useInfiniteQuery } from '@tanstack/react-query';
import { apiClient } from '@/app/apiClient';
import { getNextPageParam } from '@/features/feed/pagination';
import type { PagedApiResponse } from '@/features/feed/types';
import { getViewerZoneId } from '@/shared/lib/viewerZone';
import type { Session, SessionStatus } from '@/shared/types/session';
import { statusParam } from '../groupSessionStatuses';
import { sessionKeys } from '../queryKeys';

export const GROUP_LATER_PAGE_SIZE = 20;

/**
 * Wraps `GET /api/sessions/group/{groupId}/later?status=&viewerZoneId=&page=&size=` (SESSION-GROUP-12): the group's sessions
 * starting from tomorrow on, in PREPARING, SCHEDULED and/or CANCELLED, soonest start first. Members only. Paged 20 at a time
 * (the Sessions tab's "Others" section has a "Load more"); nothing is requested while no status is selected.
 */
export function useGroupSessionsLater(groupId: number | undefined, statuses: readonly SessionStatus[], enabled: boolean) {
  const viewerZoneId = getViewerZoneId();
  return useInfiniteQuery({
    queryKey: sessionKeys.groupSessionsLater(groupId ?? -1, statuses, viewerZoneId),
    queryFn: async ({ pageParam }) => {
      const response = await apiClient.get<PagedApiResponse<Session>>(`/sessions/group/${groupId}/later`, {
        params: { status: statusParam(statuses), viewerZoneId, page: pageParam, size: GROUP_LATER_PAGE_SIZE },
      });
      return response.data.data;
    },
    initialPageParam: 0,
    getNextPageParam,
    enabled: enabled && groupId !== undefined && statuses.length > 0,
    retry: false,
  });
}
