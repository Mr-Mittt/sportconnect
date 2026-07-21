import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/app/apiClient';
import { feedKeys } from '../queryKeys';
import type { GroupInvitation, PagedApiResponse } from '../types';

/**
 * Wraps GET /api/groups/{groupId}/invitations/sent (B8) — every invitation
 * the *current user* sent for this group that's still in flight, both
 * `pending_owner` and `pending_user` rows in one page (each row's `status`
 * tells them apart, no separate call needed). Backs GRP-3's "Waiting for
 * user accept" section, hidden entirely when this list is empty. Same
 * `size=100` reasoning as `useGroupMembers`.
 */
export function useSentInvitations(groupId: number | undefined, enabled: boolean) {
  return useQuery({
    queryKey: feedKeys.sentInvitations(groupId ?? -1),
    queryFn: async () => {
      const response = await apiClient.get<PagedApiResponse<GroupInvitation>>(
        `/groups/${groupId}/invitations/sent`,
        { params: { size: 100 } },
      );
      return response.data.data;
    },
    enabled: enabled && groupId !== undefined,
  });
}
