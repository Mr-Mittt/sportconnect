import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/app/apiClient';
import { feedKeys } from '../queryKeys';
import type { JoinRequest, PagedApiResponse } from '../types';

/**
 * Wraps GET /api/groups/{groupId}/join-requests — the group-scoped "Waiting
 * for group approve" list (owner/admin only; a member gets a 400). `enabled`
 * must be gated on the caller actually being owner/admin, not just the
 * Members tab being active — this hook doesn't re-derive that itself,
 * `useGroupMembersTabData` passes it in already combined with tab-active.
 * Same `size=100`/no-keyword-filter reasoning as `useGroupMembers`.
 */
export function useGroupJoinRequests(groupId: number | undefined, enabled: boolean) {
  return useQuery({
    queryKey: feedKeys.groupJoinRequests(groupId ?? -1),
    queryFn: async () => {
      const response = await apiClient.get<PagedApiResponse<JoinRequest>>(
        `/groups/${groupId}/join-requests`,
        { params: { size: 100 } },
      );
      return response.data.data;
    },
    enabled: enabled && groupId !== undefined,
  });
}
