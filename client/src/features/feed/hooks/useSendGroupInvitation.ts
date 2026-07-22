import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/app/apiClient';
import { feedKeys } from '../queryKeys';
import type { ApiResponse } from '@/shared/types/api';
import type { CreateInvitationPayload, GroupInvitation } from '../types';

/**
 * Wraps POST /api/groups/{groupId}/invitations (B1, GRP-4). Any group member
 * can call this — the `allowMemberInvites` group setting and the
 * inviter/invitee `areFriends` gate are enforced server-side, not here (see
 * `useInviteFriendModalData` for how the friends-only gate is applied
 * client-side ahead of time, and how the remaining 400s are surfaced
 * per-row). Re-inviting someone with an already-pending invitation is
 * idempotent server-side (returns the existing invitation, no 400).
 *
 * Only `feedKeys.sentInvitations(groupId)` is invalidated — creating an
 * invitation doesn't touch membership or any other cached list, unlike
 * `useAcceptJoinRequest`'s blunt `feedKeys.all` invalidation.
 */
export function useSendGroupInvitation(groupId: number | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (inviteeId: string) => {
      const payload: CreateInvitationPayload = { inviteeId };
      const response = await apiClient.post<ApiResponse<GroupInvitation>>(
        `/groups/${groupId}/invitations`,
        payload,
      );
      return response.data.data;
    },
    onSuccess: () => {
      if (groupId !== undefined) {
        queryClient.invalidateQueries({ queryKey: feedKeys.sentInvitations(groupId) });
      }
    },
  });
}
