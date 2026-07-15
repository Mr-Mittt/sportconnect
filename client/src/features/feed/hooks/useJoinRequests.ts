import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/app/apiClient';
import { feedKeys } from '../queryKeys';
import type { JoinRequest, PagedApiResponse } from '../types';

/**
 * Wraps GET /api/groups/join-requests/user/{userId} — already filtered to
 * `status === "pending"` server-side (GroupServiceImpl), so JoinGroupModal
 * doesn't need its own status filter, just a match on `groupId`/`groupName`
 * against whichever search result row it's rendering. Disabled while
 * `userId` is undefined, same `enabled` pattern as `useUserGroups`.
 */
export function useJoinRequests(userId: string | undefined) {
  return useQuery({
    queryKey: feedKeys.joinRequests(userId ?? ''),
    queryFn: async () => {
      const response = await apiClient.get<PagedApiResponse<JoinRequest>>(
        `/groups/join-requests/user/${userId}`,
      );
      return response.data.data;
    },
    enabled: userId !== undefined,
  });
}
