import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/app/apiClient';
import type { PagedApiResponse } from '@/features/feed/types';
import type { Session } from '@/shared/types/session';
import { sessionKeys } from '../queryKeys';

/** One page of a bucket, sent explicitly so a server default change cannot change what the shortcut shows. */
export const GROUP_SESSION_BUCKET_PAGE_SIZE = 20;

/**
 * Wraps `GET /api/sessions/group/{groupId}?bucket=&size=` (SESSION-GROUP-2): the group's sessions of one status, soonest
 * first, member only (`403 SESSION_GROUP_MEMBER_REQUIRED` for anyone else, so the caller gates it on membership).
 * The first page only: the Posts-tab shortcut keeps today's sessions out of it.
 */
export function useGroupSessionBucket(
  groupId: number | undefined,
  bucket: 'ONGOING' | 'SCHEDULED' | 'PREPARING',
  enabled: boolean,
) {
  return useQuery({
    queryKey: sessionKeys.groupSessions(groupId ?? -1, bucket),
    queryFn: async () => {
      const response = await apiClient.get<PagedApiResponse<Session>>(`/sessions/group/${groupId}`, {
        params: { bucket, size: GROUP_SESSION_BUCKET_PAGE_SIZE },
      });
      return response.data.data.content;
    },
    enabled: enabled && groupId !== undefined,
    retry: false,
  });
}
