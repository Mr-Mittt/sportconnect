import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/app/apiClient';
import { feedKeys } from '../queryKeys';
import type { ApiResponse } from '@/shared/types/api';
import type { JoinRequest, JoinRequestPayload } from '../types';

/**
 * Wraps POST /api/groups/join-requests — looked up by group NAME server-side,
 * not id (CreateJoinRequestRequest has no groupId field). `onSettled`
 * invalidates `feedKeys.all`, which covers `feedKeys.joinRequests(userId)` —
 * simplest way to get the submitted request's "pending" status to show up
 * (no optimistic write here, unlike useCreateGroup: the returned
 * JoinRequestResponse doesn't carry enough for JoinGroupModal to resolve
 * which search result row it belongs to without an extra client-side name
 * match, so a refetch is more direct).
 */
export function useJoinGroup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: JoinRequestPayload) => {
      const response = await apiClient.post<ApiResponse<JoinRequest>>(
        '/groups/join-requests',
        payload,
      );
      return response.data.data;
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: feedKeys.all }),
  });
}
