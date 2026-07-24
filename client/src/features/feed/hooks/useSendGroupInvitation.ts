import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/app/apiClient';
import type { ApiResponse } from '@/shared/types/api';
import { feedKeys } from '../queryKeys';
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
 * Blunt `feedKeys.all` invalidation (GRP-7, correcting GRP-4's original
 * narrower `feedKeys.sentInvitations`-only invalidation) — B11 means this
 * call can no longer be assumed to "just create a pending invitation and
 * nothing else": when the caller is the group's owner/admin (B11 rule 1)
 * and the invitee already has a pending join request (B11 rule 2), this
 * single call resolves straight to `accepted` and inserts a real
 * `GroupMember` row server-side. Narrower invalidation silently missed that
 * outcome — the Members list and "Waiting for group approve" queue stayed
 * stale, `InviteFriendModal`'s row for that user never flipped to
 * "member"/"invited" either, since it reads `useGroupMembers`/
 * `useSentInvitations` (an already-`accepted` invitation isn't even
 * in-flight, so it wouldn't show up in the sent-invitations list this
 * hook did invalidate). Same reasoning `useAcceptJoinRequest`/
 * `useApproveInvitation` already use for the same class of side effect.
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
    onSettled: () => queryClient.invalidateQueries({ queryKey: feedKeys.all }),
  });
}
