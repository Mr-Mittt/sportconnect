import { useInfiniteQuery } from '@tanstack/react-query';
import { apiClient } from '@/app/apiClient';
import type { ApiResponse } from '@/shared/types/api';
import { getViewerZoneId } from '@/shared/lib/viewerZone';
import type { SessionStatus } from '@/shared/types/session';
import { statusParam } from '../groupSessionStatuses';
import { sessionKeys } from '../queryKeys';
import type { GroupSessionHistoryDatesResponse } from '../types';

/** The window the history asks for, in days (the owner's 30; the server allows up to 90). */
export const GROUP_HISTORY_WINDOW_DAYS = 30;

/**
 * Wraps `GET /api/sessions/group/{groupId}/history/dates?status=&days=&before=&viewerZoneId=` (SESSION-GROUP-12): the end dates
 * of the group's COMPLETED and/or CANCELLED sessions in one window of days ending the day before `before` (the first window
 * ends yesterday), each with its count, newest first. Members only. Pagination is over *windows*: the next page passes the
 * previous page's `nextBefore` as `before`, and `hasMore` says a matching session ends before it. A window can be empty while
 * `hasMore` is true, so the caller keeps asking (`useGroupSessionsTabData`). A collapsed date row is cheap: this call carries
 * only `(date, count)`, never sessions.
 */
export function useGroupHistoryDates(groupId: number | undefined, statuses: readonly SessionStatus[], enabled: boolean) {
  const viewerZoneId = getViewerZoneId();
  return useInfiniteQuery({
    queryKey: sessionKeys.groupHistoryDates(groupId ?? -1, statuses, viewerZoneId),
    queryFn: async ({ pageParam }) => {
      const response = await apiClient.get<ApiResponse<GroupSessionHistoryDatesResponse>>(
        `/sessions/group/${groupId}/history/dates`,
        {
          params: {
            status: statusParam(statuses),
            days: GROUP_HISTORY_WINDOW_DAYS,
            viewerZoneId,
            ...(pageParam !== undefined ? { before: pageParam } : {}),
          },
        },
      );
      return response.data.data;
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => (lastPage.hasMore ? lastPage.nextBefore : undefined),
    enabled: enabled && groupId !== undefined && statuses.length > 0,
    retry: false,
  });
}
