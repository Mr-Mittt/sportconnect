import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/app/apiClient';
import { feedKeys } from '../queryKeys';
import type { ApiResponse } from '@/shared/types/api';

/**
 * Wraps PUT /api/groups/invitations/{invitationId}/decline (GRP-7,
 * owner/admin only) — moves an invitation to `declined_by_owner`. Distinct
 * hook from `useDeclineJoinRequest` (different endpoint/id space), same
 * blunt `feedKeys.all` invalidation.
 */
export function useDeclineInvitation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (invitationId: number) => {
      await apiClient.put<ApiResponse<void>>(`/groups/invitations/${invitationId}/decline`);
      return invitationId;
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: feedKeys.all }),
  });
}
