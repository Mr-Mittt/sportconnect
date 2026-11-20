import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/app/apiClient';
import type { PagedApiResponse } from '@/features/feed/types';
import { getViewerZoneId } from '@/shared/lib/viewerZone';
import type { Session, SessionStatus } from '@/shared/types/session';
import { statusParam } from '../groupSessionStatuses';
import { sessionKeys } from '../queryKeys';

/**
 * Wraps `GET /api/sessions/group/{groupId}/today?status=&viewerZoneId=` (SESSION-GROUP-12): the group's sessions whose
 * playing time overlaps today in the viewer's zone, in the given statuses, in the server's order (ONGOING, SCHEDULED,
 * PREPARING, COMPLETED, CANCELLED, then start). A session that started yesterday and ends today or tomorrow is included.
 * Members only (`403 SESSION_GROUP_MEMBER_REQUIRED` for anyone else, so the caller gates it on membership). One page (the
 * server's 50): a group has a handful of sessions a day.
 *
 * The Sessions tab's "Today's" section and the Posts-tab shortcut both read it. With no status selected nothing is
 * requested (the section shows its "select a status" hint).
 */
export function useGroupSessionsToday(groupId: number | undefined, statuses: readonly SessionStatus[], enabled: boolean) {
  const viewerZoneId = getViewerZoneId();
  return useQuery({
    queryKey: sessionKeys.groupSessionsToday(groupId ?? -1, statuses, viewerZoneId),
    queryFn: async () => {
      const response = await apiClient.get<PagedApiResponse<Session>>(`/sessions/group/${groupId}/today`, {
        params: { status: statusParam(statuses), viewerZoneId },
      });
      return response.data.data.content;
    },
    enabled: enabled && groupId !== undefined && statuses.length > 0,
    retry: false,
  });
}
