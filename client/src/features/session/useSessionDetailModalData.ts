import { useMemo } from 'react';
import { useAuthStore } from '@/app/authStore';
import { useUserGroups } from '@/features/feed/hooks/useUserGroups';
import { useApproveParticipant } from './hooks/useApproveParticipant';
import { useCancelSession } from './hooks/useCancelSession';
import { useLikeSession } from './hooks/useLikeSession';
import { useRejectParticipant } from './hooks/useRejectParticipant';
import { useRequestedParticipants } from './hooks/useRequestedParticipants';
import { useSession } from './hooks/useSession';
import { useSessionParticipants } from './hooks/useSessionParticipants';
import { useSessionParticipationAction } from './hooks/useSessionParticipationAction';
import { useUnlikeSession } from './hooks/useUnlikeSession';
import { useSessionCommentsData } from './useSessionCommentsData';

const CAN_MANAGE_ROLES = new Set(['group_owner', 'group_admin']);

/**
 * The full `SessionDetailModal` data slice for one selected session — session/participants
 * queries, real `canManage` (creator for a standalone session, owner/admin role for a
 * group-linked one, resolved from the caller's own groups), join/leave/cancel, the
 * canManage-gated approval queue, likes, and the Discussion section. Extracted so
 * `useMatchesPageData` (the Matches page's own detail dialog) and every rail-hosting page's
 * in-place "View details" modal (Home Feed/Groups/Friends, via `useDiscoverModalData` —
 * CLIENT-SESSION-9 follow-up) share one implementation instead of drifting duplicates. Previously
 * `useDiscoverModalData` hardcoded `canManage: false` on the (correct, at the time) assumption
 * that a Discover-sourced session could never be self-managed — that assumption broke once the
 * same detail slice started backing the rail's own sessions too, which genuinely can be ones the
 * caller manages.
 *
 * Owns its own `useSessionParticipationAction()` instance, independent of any card-level one a
 * caller (`useMatchesPageData`) also holds for its list of cards — both invalidate the same
 * `sessionKeys.all` root on success, so this is a harmless duplicate mutation object, not a
 * correctness issue.
 */
export function useSessionDetailModalData(sessionId: number | null) {
  const currentUserId = useAuthStore((state) => state.user?.id);
  const isDetailOpen = sessionId !== null;

  const sessionQuery = useSession(sessionId ?? undefined, isDetailOpen);
  const participantsQuery = useSessionParticipants(sessionId ?? undefined, isDetailOpen);

  const groupsQuery = useUserGroups(currentUserId);
  const groups = useMemo(() => groupsQuery.data?.content ?? [], [groupsQuery.data]);
  const canManage = useMemo(() => {
    const session = sessionQuery.data;
    if (session === undefined || currentUserId === undefined) return false;
    if (session.groupId === null) return session.createdBy === currentUserId;
    const group = groups.find((candidate) => candidate.id === session.groupId);
    return group?.currentUserRole !== null && CAN_MANAGE_ROLES.has(group?.currentUserRole ?? '');
  }, [sessionQuery.data, currentUserId, groups]);

  const { joinMutation, leaveMutation } = useSessionParticipationAction();
  const cancelMutation = useCancelSession();
  const likeMutation = useLikeSession();
  const unlikeMutation = useUnlikeSession();

  // CLIENT-SESSION-4: the approval queue only ever fires for a canManage caller — gating the
  // query on it too (not just hiding the section) avoids a request that would 400 for anyone else.
  const requestedParticipantsQuery = useRequestedParticipants(
    sessionId ?? undefined,
    isDetailOpen && canManage,
  );
  const approveParticipantMutation = useApproveParticipant();
  const rejectParticipantMutation = useRejectParticipant();

  // CLIENT-SESSION-8: the detail dialog's Discussion section.
  const sessionCommentsData = useSessionCommentsData(sessionId ?? undefined, isDetailOpen);

  return {
    /**
     * CLIENT-MODAL-1: clears the join/leave/cancel failures before the dialog closes.
     *
     * Worse here than the plain stale-error case elsewhere: this dialog reopens for a
     * *different* session, so without this a failed join on session A renders its error
     * against session B — an error attributed to the wrong entity, not just a stale one.
     *
     * Only the three mutation-backed flags need it. `isSessionError`,
     * `isParticipantsError`, `isRequestedParticipantsError` and `isCommentsError` are all
     * query-derived and re-evaluate on the next fetch, so they cannot go stale this way.
     */
    resetActionErrors: () => {
      joinMutation.reset();
      leaveMutation.reset();
      cancelMutation.reset();
    },
    selectedSession: sessionQuery.data,
    isSessionLoading: sessionQuery.isLoading,
    isSessionError: sessionQuery.isError,
    participants: participantsQuery.data?.content ?? [],
    isParticipantsLoading: participantsQuery.isLoading,
    isParticipantsError: participantsQuery.isError,
    currentUserId: currentUserId ?? '',
    canManage,
    onJoin: () => sessionId !== null && joinMutation.mutate(sessionId),
    isJoining: joinMutation.isPending,
    isJoinError: joinMutation.isError,
    onLeave: () => sessionId !== null && leaveMutation.mutate(sessionId),
    isLeaving: leaveMutation.isPending,
    isLeaveError: leaveMutation.isError,
    onConfirmCancel: (reason: string) =>
      sessionId !== null &&
      cancelMutation.mutate({ sessionId, payload: { reason: reason || undefined } }),
    isCancelling: cancelMutation.isPending,
    isCancelError: cancelMutation.isError,
    onToggleLike: () => {
      if (sessionId === null) return;
      if (sessionQuery.data?.isLikedByCurrentUser) {
        unlikeMutation.mutate(sessionId);
      } else {
        likeMutation.mutate(sessionId);
      }
    },
    isTogglingLike: likeMutation.isPending || unlikeMutation.isPending,

    requestedParticipants: requestedParticipantsQuery.data?.content ?? [],
    isRequestedParticipantsLoading: requestedParticipantsQuery.isLoading,
    isRequestedParticipantsError: requestedParticipantsQuery.isError,
    onApproveParticipant: (userId: string) =>
      sessionId !== null && approveParticipantMutation.mutate({ sessionId, userId }),
    isApprovingParticipant: approveParticipantMutation.isPending,
    onRejectParticipant: (userId: string, reason: string) =>
      sessionId !== null && rejectParticipantMutation.mutate({ sessionId, userId, reason }),
    isRejectingParticipant: rejectParticipantMutation.isPending,

    ...sessionCommentsData,
  };
}
