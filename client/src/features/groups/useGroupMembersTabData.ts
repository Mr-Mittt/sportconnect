import { useMemo } from 'react';
import { useAcceptJoinRequest } from '@/features/feed/hooks/useAcceptJoinRequest';
import { useDeclineJoinRequest } from '@/features/feed/hooks/useDeclineJoinRequest';
import { useGroupJoinRequests } from '@/features/feed/hooks/useGroupJoinRequests';
import { useGroupMembers } from '@/features/feed/hooks/useGroupMembers';
import { useSentInvitations } from '@/features/feed/hooks/useSentInvitations';

/**
 * GRP-3's Members tab data boundary — mirrors `useSettingsUnsavedGuard`'s
 * role as a page-level orchestration hook, minus any draft/save state (this
 * tab has none). Wires the three read queries, gated on `isActive` (the
 * Members tab being the one currently shown) and, for join requests, on
 * `canManage` too — a `group_member` calling `getGroupJoinRequests` gets a
 * 400, so this never fires that request for them at all rather than firing
 * it and hiding the error.
 *
 * `administrators`/`members` are `useGroupMembers`' one fetch split
 * client-side by `roleName` (open decision #1: the owner folds into
 * "Group administrator" rather than a 6th section) — owner sorted first
 * within administrators.
 */
export function useGroupMembersTabData(
  groupId: number | undefined,
  isActive: boolean,
  currentUserRole: string | null,
) {
  const canManage = currentUserRole === 'group_owner' || currentUserRole === 'group_admin';

  const membersQuery = useGroupMembers(groupId, isActive);
  const joinRequestsQuery = useGroupJoinRequests(groupId, isActive && canManage);
  const sentInvitationsQuery = useSentInvitations(groupId, isActive);

  const acceptMutation = useAcceptJoinRequest();
  const declineMutation = useDeclineJoinRequest();

  const { administrators, members } = useMemo(() => {
    const allMembers = membersQuery.data?.content ?? [];
    return {
      administrators: allMembers
        .filter((member) => member.roleName === 'group_owner' || member.roleName === 'group_admin')
        .sort((a, b) => (a.roleName === 'group_owner' ? -1 : b.roleName === 'group_owner' ? 1 : 0)),
      members: allMembers.filter((member) => member.roleName === 'group_member'),
    };
  }, [membersQuery.data]);

  return {
    canManage,
    administrators,
    members,
    isMembersLoading: membersQuery.isLoading,
    isMembersError: membersQuery.isError,
    retryMembers: () => membersQuery.refetch(),
    joinRequests: joinRequestsQuery.data?.content ?? [],
    isJoinRequestsLoading: joinRequestsQuery.isLoading,
    isJoinRequestsError: joinRequestsQuery.isError,
    retryJoinRequests: () => joinRequestsQuery.refetch(),
    sentInvitations: sentInvitationsQuery.data?.content ?? [],
    isSentInvitationsLoading: sentInvitationsQuery.isLoading,
    isSentInvitationsError: sentInvitationsQuery.isError,
    retrySentInvitations: () => sentInvitationsQuery.refetch(),
    acceptJoinRequest: (requestId: number) => acceptMutation.mutate(requestId),
    isAcceptingJoinRequest: acceptMutation.isPending,
    isAcceptJoinRequestError: acceptMutation.isError,
    declineJoinRequest: (requestId: number) => declineMutation.mutate(requestId),
    isDecliningJoinRequest: declineMutation.isPending,
    isDeclineJoinRequestError: declineMutation.isError,
  };
}

export type GroupMembersTabData = ReturnType<typeof useGroupMembersTabData>;
