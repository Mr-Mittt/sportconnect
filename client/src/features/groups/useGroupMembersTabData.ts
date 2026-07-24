import { useMemo } from 'react';
import { useAcceptJoinRequest } from '@/features/feed/hooks/useAcceptJoinRequest';
import { useApproveInvitation } from '@/features/feed/hooks/useApproveInvitation';
import { useDeclineInvitation } from '@/features/feed/hooks/useDeclineInvitation';
import { useDeclineJoinRequest } from '@/features/feed/hooks/useDeclineJoinRequest';
import { useGroupInvitations } from '@/features/feed/hooks/useGroupInvitations';
import { useGroupJoinRequests } from '@/features/feed/hooks/useGroupJoinRequests';
import { useGroupMembers } from '@/features/feed/hooks/useGroupMembers';
import { useSentInvitations } from '@/features/feed/hooks/useSentInvitations';
import type { GroupInvitation, JoinRequest } from '@/features/feed/types';

/**
 * GRP-7: a single "Waiting for group approve" row — either an existing
 * `JoinRequest` (self-service) or a `pending_owner` `GroupInvitation`
 * (member-initiated), merged into one chronological list per the ticket
 * spec. `GroupMembersTab` renders each variant differently (a join-request
 * row shows only the requester; an invitation row shows both inviter and
 * invitee) and filters an invitation row by `inviteeFullName`, not the
 * inviter — the prospective member is what "find member" means for either
 * row type.
 */
export type ApprovalQueueItem =
  | { type: 'join_request'; data: JoinRequest }
  | { type: 'invitation'; data: GroupInvitation };

/**
 * GRP-3's Members tab data boundary — mirrors `useSettingsUnsavedGuard`'s
 * role as a page-level orchestration hook, minus any draft/save state (this
 * tab has none). Wires the read queries, gated on `isActive` (the Members
 * tab being the one currently shown) and, for join requests and the
 * approval-queue invitations, on `canManage` too — a `group_member` calling
 * either `getGroupJoinRequests` or `getGroupInvitations` gets a 400, so this
 * never fires those requests for them at all rather than firing and hiding
 * the error.
 *
 * `administrators`/`members` are `useGroupMembers`' one fetch split
 * client-side by `roleName` (open decision #1: the owner folds into
 * "Group administrator" rather than a 6th section) — owner sorted first
 * within administrators.
 *
 * GRP-7: `approvalQueue` merges the join-requests and group-invitations
 * queries into one list, sorted oldest-first by `createdAt` (a FIFO
 * approval queue reads naturally oldest-on-top). `acceptApprovalQueueItem`/
 * `declineApprovalQueueItem` dispatch to the right mutation
 * (`useAcceptJoinRequest`/`useApproveInvitation` and
 * `useDeclineJoinRequest`/`useDeclineInvitation` respectively) based on the
 * item's `type` — the component only ever calls one pair of handlers,
 * unaware of which underlying endpoint actually fires.
 */
export function useGroupMembersTabData(
  groupId: number | undefined,
  isActive: boolean,
  currentUserRole: string | null,
) {
  const canManage = currentUserRole === 'group_owner' || currentUserRole === 'group_admin';

  const membersQuery = useGroupMembers(groupId, isActive);
  const joinRequestsQuery = useGroupJoinRequests(groupId, isActive && canManage);
  const groupInvitationsQuery = useGroupInvitations(groupId, isActive && canManage);
  const sentInvitationsQuery = useSentInvitations(groupId, isActive);

  const acceptJoinRequestMutation = useAcceptJoinRequest();
  const declineJoinRequestMutation = useDeclineJoinRequest();
  const approveInvitationMutation = useApproveInvitation();
  const declineInvitationMutation = useDeclineInvitation();

  const { administrators, members } = useMemo(() => {
    const allMembers = membersQuery.data?.content ?? [];
    return {
      administrators: allMembers
        .filter((member) => member.roleName === 'group_owner' || member.roleName === 'group_admin')
        .sort((a, b) => (a.roleName === 'group_owner' ? -1 : b.roleName === 'group_owner' ? 1 : 0)),
      members: allMembers.filter((member) => member.roleName === 'group_member'),
    };
  }, [membersQuery.data]);

  const approvalQueue = useMemo<ApprovalQueueItem[]>(() => {
    const joinRequestItems: ApprovalQueueItem[] = (joinRequestsQuery.data?.content ?? []).map(
      (data) => ({ type: 'join_request', data }),
    );
    const invitationItems: ApprovalQueueItem[] = (groupInvitationsQuery.data?.content ?? []).map(
      (data) => ({ type: 'invitation', data }),
    );
    return [...joinRequestItems, ...invitationItems].sort(
      (a, b) => new Date(a.data.createdAt).getTime() - new Date(b.data.createdAt).getTime(),
    );
  }, [joinRequestsQuery.data, groupInvitationsQuery.data]);

  const acceptApprovalQueueItem = (item: ApprovalQueueItem) => {
    if (item.type === 'join_request') acceptJoinRequestMutation.mutate(item.data.id);
    else approveInvitationMutation.mutate(item.data.id);
  };
  const declineApprovalQueueItem = (item: ApprovalQueueItem) => {
    if (item.type === 'join_request') declineJoinRequestMutation.mutate(item.data.id);
    else declineInvitationMutation.mutate(item.data.id);
  };

  return {
    canManage,
    administrators,
    members,
    isMembersLoading: membersQuery.isLoading,
    isMembersError: membersQuery.isError,
    retryMembers: () => membersQuery.refetch(),
    approvalQueue,
    isApprovalQueueLoading: joinRequestsQuery.isLoading || groupInvitationsQuery.isLoading,
    isApprovalQueueError: joinRequestsQuery.isError || groupInvitationsQuery.isError,
    retryApprovalQueue: () => {
      void joinRequestsQuery.refetch();
      void groupInvitationsQuery.refetch();
    },
    sentInvitations: sentInvitationsQuery.data?.content ?? [],
    isSentInvitationsLoading: sentInvitationsQuery.isLoading,
    isSentInvitationsError: sentInvitationsQuery.isError,
    retrySentInvitations: () => sentInvitationsQuery.refetch(),
    acceptApprovalQueueItem,
    isAcceptingApprovalQueueItem:
      acceptJoinRequestMutation.isPending || approveInvitationMutation.isPending,
    declineApprovalQueueItem,
    isDecliningApprovalQueueItem:
      declineJoinRequestMutation.isPending || declineInvitationMutation.isPending,
  };
}

export type GroupMembersTabData = ReturnType<typeof useGroupMembersTabData>;
