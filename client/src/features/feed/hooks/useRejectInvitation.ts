import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/app/apiClient';
import { feedKeys } from '../queryKeys';
import type { ApiResponse } from '@/shared/types/api';

/**
 * Wraps PUT /api/groups/invitations/{invitationId}/reject (GRP-7, the
 * invitee) — moves the invitation to `declined_by_user`. Same blunt
 * `feedKeys.all` invalidation as the other mutation hooks here.
 */
export function useRejectInvitation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (invitationId: number) => {
      await apiClient.put<ApiResponse<void>>(`/groups/invitations/${invitationId}/reject`);
      return invitationId;
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: feedKeys.all }),
  });
}
