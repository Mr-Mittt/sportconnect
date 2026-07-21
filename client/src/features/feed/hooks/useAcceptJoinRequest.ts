import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/app/apiClient';
import { feedKeys } from '../queryKeys';
import type { ApiResponse } from '@/shared/types/api';

/**
 * Wraps PUT /api/groups/join-requests/{requestId}/accept (owner/admin only).
 * Accepting inserts a new `GroupMember` row server-side, so this invalidates
 * `feedKeys.all` on settle (same blunt-invalidation convention as
 * `useLeaveGroup`/`useDeleteGroup`) rather than a targeted cache write — both
 * the join-requests list and the members list (and the group's memberCount)
 * need to refetch, not just one of them.
 */
export function useAcceptJoinRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (requestId: number) => {
      await apiClient.put<ApiResponse<void>>(`/groups/join-requests/${requestId}/accept`);
      return requestId;
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: feedKeys.all }),
  });
}
