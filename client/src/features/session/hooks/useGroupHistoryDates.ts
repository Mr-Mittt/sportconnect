import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/app/apiClient';
import type { ApiResponse } from '@/shared/types/api';
import { getViewerZoneId } from '@/shared/lib/viewerZone';
import type { SessionStatus } from '@/shared/types/session';
import { statusParam } from '../groupSessionStatuses';
import type { HistoryMonthWindow } from '../groupHistoryMonth';
import { sessionKeys } from '../queryKeys';
import type { GroupSessionHistoryDatesResponse } from '../types';

/**
 * Wraps `GET /api/sessions/group/{groupId}/history/dates?status=&days=&before=&viewerZoneId=` (SESSION-GROUP-12) for **one month**
 * (CLIENT-GROUP-UI-1, replacing the 30-day "Load more" windows): the end dates of the group's COMPLETED and/or CANCELLED
 * sessions inside `window` (the month's past days, `historyMonthWindow`), each with its count. One call per month and status
 * set; `hasMore` and `nextBefore` of the answer are not used. Nothing is asked while `window` is null (a month with no past day)
 * or no status is chosen. A collapsed date row is cheap: this call carries only `(date, count)`, never sessions.
 */
export function useGroupHistoryDates(
  groupId: number | undefined,
  statuses: readonly SessionStatus[],
  month: string,
  window: HistoryMonthWindow | null,
  enabled: boolean,
) {
  const viewerZoneId = getViewerZoneId();
  return useQuery({
    queryKey: sessionKeys.groupHistoryDates(groupId ?? -1, statuses, viewerZoneId, month),
    queryFn: async () => {
      const response = await apiClient.get<ApiResponse<GroupSessionHistoryDatesResponse>>(
        `/sessions/group/${groupId}/history/dates`,
        {
          params: {
            status: statusParam(statuses),
            days: window!.days,
            before: window!.before,
            viewerZoneId,
          },
        },
      );
      return response.data.data;
    },
    enabled: enabled && groupId !== undefined && statuses.length > 0 && window !== null,
    retry: false,
  });
}
