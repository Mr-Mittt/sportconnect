import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/app/apiClient';
import { feedKeys } from '../queryKeys';
import type { ApiResponse } from '@/shared/types/api';

/**
 * Wraps PUT /api/groups/invitations/{invitationId}/approve (GRP-7,
 * owner/admin only) — moves an invitation from `pending_owner` to
 * `pending_user` (or, server-side per B11, straight to `accepted` if the
 * invitee already had a pending join request — either way this list no
 * longer shows it, so no client-side branching needed). Same blunt
 * `feedKeys.all` invalidation as `useAcceptJoinRequest`.
 */
export function useApproveInvitation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (invitationId: number) => {
      await apiClient.put<ApiResponse<void>>(`/groups/invitations/${invitationId}/approve`);
      return invitationId;
    },
    // CLIENT-ERR-5: GroupsPage reports a failure in GroupActionErrorDialog, so the global toast is off.
    meta: { errorDisplay: 'inline' },
    onSettled: () => queryClient.invalidateQueries({ queryKey: feedKeys.all }),
  });
}
