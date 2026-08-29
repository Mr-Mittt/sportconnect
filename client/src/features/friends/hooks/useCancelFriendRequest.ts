import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/app/apiClient';
import { friendKeys } from '../queryKeys';
import type { ApiResponse } from '@/shared/types/api';

/**
 * Wraps `DELETE /api/users/friends/requests/{requestId}` (U1's
 * `cancelFriendRequest`) — the sender withdrawing their own still-`PENDING`
 * outgoing request. Only reachable from `FriendProfilePanel`'s `PENDING_SENT`
 * action bar, so the caller always has a real `requestId`.
 */
export function useCancelFriendRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (requestId: string) => {
      await apiClient.delete<ApiResponse<void>>(`/users/friends/requests/${requestId}`);
      return requestId;
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: friendKeys.all }),
  });
}
