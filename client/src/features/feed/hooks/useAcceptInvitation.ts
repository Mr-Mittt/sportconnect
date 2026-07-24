import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/app/apiClient';
import { feedKeys } from '../queryKeys';
import type { ApiResponse } from '@/shared/types/api';

/**
 * Wraps PUT /api/groups/invitations/{invitationId}/accept (GRP-7, the
 * invitee) — inserts a new `GroupMember` row server-side, same blunt
 * `feedKeys.all` invalidation as `useAcceptJoinRequest` (both the
 * invitations list and the user's groups list need to refetch). Returns the
 * `invitationId` the caller mutated with — `useGroupInvitationsData` doesn't
 * need it (the accepted invitation carries no `sportId`, per GRP-7's own
 * note, so navigation reads `groupId` from the row it already has, not this
 * return value), kept only for parity with the other mutation hooks here.
 */
export function useAcceptInvitation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (invitationId: number) => {
      await apiClient.put<ApiResponse<void>>(`/groups/invitations/${invitationId}/accept`);
      return invitationId;
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: feedKeys.all }),
  });
}
