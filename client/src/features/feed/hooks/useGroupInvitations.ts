import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/app/apiClient';
import { feedKeys } from '../queryKeys';
import type { GroupInvitation, PagedApiResponse } from '../types';

/**
 * Wraps GET /api/groups/{groupId}/invitations (GRP-7) — the owner/admin's
 * queue of `pending_owner` invitations awaiting their approval, regardless
 * of which member sent them. Owner/admin only (a member gets a 400) — same
 * `enabled` contract as `useGroupJoinRequests`: the caller combines
 * tab-active with `canManage` before passing it in, this hook doesn't
 * re-derive that itself. Backs GRP-7's merged "Waiting for group approve"
 * list in `useGroupMembersTabData`.
 */
export function useGroupInvitations(groupId: number | undefined, enabled: boolean) {
  return useQuery({
    queryKey: feedKeys.groupInvitations(groupId ?? -1),
    queryFn: async () => {
      const response = await apiClient.get<PagedApiResponse<GroupInvitation>>(
        `/groups/${groupId}/invitations`,
        { params: { size: 100 } },
      );
      return response.data.data;
    },
    enabled: enabled && groupId !== undefined,
  });
}
