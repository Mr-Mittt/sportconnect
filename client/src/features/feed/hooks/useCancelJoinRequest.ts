import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/app/apiClient';
import { feedKeys } from '../queryKeys';
import type { ApiResponse } from '@/shared/types/api';

/**
 * Wraps DELETE /api/groups/join-requests/{requestId} (GRP-8 part 3) — the
 * requester withdraws their own still-`pending` join request. Mirrors
 * `useCancelInvitation`'s shape exactly: blunt `feedKeys.all` invalidation
 * so both the new "Join requests" section and `JoinGroupModal`'s
 * "already requested" badge (both read `useJoinRequests`) refetch.
 */
export function useCancelJoinRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (requestId: number) => {
      await apiClient.delete<ApiResponse<void>>(`/groups/join-requests/${requestId}`);
      return requestId;
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: feedKeys.all }),
  });
}
