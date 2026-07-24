import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/app/apiClient';
import { feedKeys } from '../queryKeys';
import type { ApiResponse } from '@/shared/types/api';

/**
 * Wraps DELETE /api/groups/invitations/{invitationId} — the inviter cancels their own
 * invitation while it's still `pending_owner`. Blunt `feedKeys.all` invalidation, same as every
 * other mutation on this table (`useApproveInvitation`/`useDeclineInvitation`/etc.) — the
 * cancelled row needs to disappear from both `useSentInvitations` (the inviter's own view) and
 * `useGroupInvitations` (the owner/admin's approval queue), which are two different queries.
 */
export function useCancelInvitation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (invitationId: number) => {
      await apiClient.delete<ApiResponse<void>>(`/groups/invitations/${invitationId}`);
      return invitationId;
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: feedKeys.all }),
  });
}
