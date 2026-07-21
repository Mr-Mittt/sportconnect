import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/app/apiClient';
import { feedKeys } from '../queryKeys';
import type { ApiResponse } from '@/shared/types/api';

/**
 * Wraps PUT /api/groups/join-requests/{requestId}/decline (owner/admin
 * only). Same blunt `feedKeys.all` invalidation as `useAcceptJoinRequest` —
 * the join-requests list needs to refetch either way.
 */
export function useDeclineJoinRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (requestId: number) => {
      await apiClient.put<ApiResponse<void>>(`/groups/join-requests/${requestId}/decline`);
      return requestId;
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: feedKeys.all }),
  });
}
