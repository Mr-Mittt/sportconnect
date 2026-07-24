import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/app/apiClient';
import { feedKeys } from '../queryKeys';
import type { GroupInvitation, PagedApiResponse } from '../types';

/**
 * Wraps GET /api/groups/invitations/user (GRP-7) — every `pending_user`
 * invitation addressed to the current user, across all groups (not
 * group-scoped, unlike `useGroupInvitations`/`useSentInvitations`). Backs
 * `GroupDiscoveryPanel`'s new "Invitations" section on the All-groups
 * landing state.
 */
export function useUserPendingInvitations(userId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: feedKeys.userPendingInvitations(userId ?? ''),
    queryFn: async () => {
      const response = await apiClient.get<PagedApiResponse<GroupInvitation>>(
        '/groups/invitations/user',
        { params: { size: 100 } },
      );
      return response.data.data;
    },
    enabled: enabled && userId !== undefined,
  });
}
