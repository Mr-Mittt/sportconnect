import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/app/apiClient';
import { friendKeys } from '../queryKeys';
import type { ApiResponse } from '@/shared/types/api';

/**
 * Wraps `PUT /api/users/friends/requests/{requestId}/decline` (U1).
 */
export function useDeclineFriendRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (requestId: string) => {
      await apiClient.put<ApiResponse<void>>(`/users/friends/requests/${requestId}/decline`);
      return requestId;
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: friendKeys.all }),
  });
}
