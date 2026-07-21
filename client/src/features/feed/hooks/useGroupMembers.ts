import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/app/apiClient';
import { feedKeys } from '../queryKeys';
import type { GroupMember, PagedApiResponse } from '../types';

/**
 * Wraps GET /api/groups/{groupId}/members (any authenticated caller). GRP-3
 * open decision #2: the endpoint has no keyword filter, so this fetches one
 * larger page (`size=100`) and `GroupMembersTab` filters/splits by role
 * client-side — a known ~100-row cap for MVP, not a real pagination UI.
 * `enabled` gates the fetch to while the Members tab is active.
 */
export function useGroupMembers(groupId: number | undefined, enabled: boolean) {
  return useQuery({
    queryKey: feedKeys.groupMembers(groupId ?? -1),
    queryFn: async () => {
      const response = await apiClient.get<PagedApiResponse<GroupMember>>(
        `/groups/${groupId}/members`,
        { params: { size: 100 } },
      );
      return response.data.data;
    },
    enabled: enabled && groupId !== undefined,
  });
}
