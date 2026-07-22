import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/app/apiClient';
import { friendKeys } from '../queryKeys';
import type { ApiResponse } from '@/shared/types/api';

/**
 * Wraps `PUT /api/users/friends/requests/{requestId}/accept` (U1).
 * Accepting inserts a new friendship row server-side, so this invalidates
 * `friendKeys.all` on settle (same blunt-invalidation convention as
 * `useAcceptJoinRequest`) — both the friends list and the received-requests
 * list need to refetch.
 */
export function useAcceptFriendRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (requestId: string) => {
      await apiClient.put<ApiResponse<void>>(`/users/friends/requests/${requestId}/accept`);
      return requestId;
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: friendKeys.all }),
  });
}
