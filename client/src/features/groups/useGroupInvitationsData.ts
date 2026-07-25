import { useMemo } from 'react';
import { useAcceptInvitation } from '@/features/feed/hooks/useAcceptInvitation';
import { useRejectInvitation } from '@/features/feed/hooks/useRejectInvitation';
import { useUserPendingInvitations } from '@/features/feed/hooks/useUserPendingInvitations';

/**
 * GRP-7 part 2's data boundary for `GroupDiscoveryPanel`'s new
 * "Invitations" section — same page-level-hook role as
 * `useJoinGroupModalData`/`useInviteFriendModalData` sitting alongside it in
 * `GroupsPage.tsx`. `enabled` should be `selectedGroup === null` (the
 * All-groups landing state being the one actually shown) — this hook
 * doesn't re-derive that itself.
 *
 * Sorts newest-first by `createdAt` — unlike the Members tab's oldest-first
 * approval queue, a personal invitation inbox reads better with the newest
 * arrival on top.
 *
 * `onAccepted(groupId, sportId)` fires after a successful accept, before this
 * hook's own `feedKeys.all` invalidation settles — `GroupsPage.tsx` uses it
 * to navigate straight to the new group with its own sport pill active
 * (GRP-8 part 1, via B15's `sportId` on the invitation — no more
 * `setActiveSport('all')` detour), keeping that store-level orchestration in
 * the page component rather than reaching into `groupsPageStore` from here.
 *
 * `rejectInvitation` takes an optional `reason` (GRP-8 part 2/B13) — reasons
 * are optional at this layer too (empty/absent both send fine).
 */
export function useGroupInvitationsData(
  userId: string | undefined,
  enabled: boolean,
  onAccepted: (groupId: number, sportId: number) => void,
) {
  const invitationsQuery = useUserPendingInvitations(userId, enabled);
  const acceptMutation = useAcceptInvitation();
  const rejectMutation = useRejectInvitation();

  const invitations = useMemo(
    () =>
      [...(invitationsQuery.data?.content ?? [])].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      ),
    [invitationsQuery.data],
  );

  const acceptInvitation = (invitationId: number) => {
    const invitation = invitations.find((candidate) => candidate.id === invitationId);
    acceptMutation.mutate(invitationId, {
      onSuccess: () => {
        if (invitation !== undefined) onAccepted(invitation.groupId, invitation.sportId);
      },
    });
  };

  return {
    invitations,
    isLoading: invitationsQuery.isLoading,
    isError: invitationsQuery.isError,
    retry: () => invitationsQuery.refetch(),
    acceptInvitation,
    isAccepting: acceptMutation.isPending,
    rejectInvitation: (invitationId: number, reason?: string) =>
      rejectMutation.mutate({ invitationId, reason }),
    isRejecting: rejectMutation.isPending,
    isRejectError: rejectMutation.isError,
  };
}

export type GroupInvitationsData = ReturnType<typeof useGroupInvitationsData>;
