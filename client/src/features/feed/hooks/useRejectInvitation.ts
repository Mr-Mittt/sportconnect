import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/app/apiClient';
import { feedKeys } from '../queryKeys';
import type { ApiResponse } from '@/shared/types/api';

interface RejectInvitationPayload {
  invitationId: number;
  /** GRP-8/B13: optional — an empty/absent reason is sent as-is, matching
   * the backend's own optional `RejectInvitationRequest.reason`. */
  reason?: string;
}

/**
 * Wraps PUT /api/groups/invitations/{invitationId}/reject (GRP-7, the
 * invitee) — moves the invitation to `declined_by_user`, persisting an
 * optional reason (GRP-8/B13). Same blunt `feedKeys.all` invalidation as the
 * other mutation hooks here.
 */
export function useRejectInvitation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ invitationId, reason }: RejectInvitationPayload) => {
      await apiClient.put<ApiResponse<void>>(`/groups/invitations/${invitationId}/reject`, {
        reason: reason ?? undefined,
      });
      return invitationId;
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: feedKeys.all }),
  });
}
