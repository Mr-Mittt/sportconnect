import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/app/apiClient';
import { useGroupsPageStore } from '@/app/groupsPageStore';
import { sessionKeys } from '@/features/session/queryKeys';
import { feedKeys } from '../queryKeys';
import type { ApiResponse } from '@/shared/types/api';
import type { Group, PageResponse } from '../types';

/**
 * Wraps DELETE /api/groups/{groupId}/leave. Any member can leave except the
 * owner (must transfer ownership first — existing backend rule, not
 * re-validated client-side; a 400 surfaces via `isError`). On success, drops
 * the group from the `userGroups` cache and clears the page's selection back
 * to "All" via `groupsPageStore.selectGroup(null)`.
 */
export function useLeaveGroup(currentUserId: string | undefined) {
  const queryClient = useQueryClient();
  const selectGroup = useGroupsPageStore((state) => state.selectGroup);
  return useMutation({
    meta: { errorDisplay: 'inline' },
    mutationFn: async (groupId: number) => {
      await apiClient.delete<ApiResponse<void>>(`/groups/${groupId}/leave`);
      return groupId;
    },
    onSuccess: (groupId) => {
      selectGroup(null);
      if (currentUserId === undefined) return;
      queryClient.setQueryData<PageResponse<Group>>(feedKeys.userGroups(currentUserId), (data) => {
        if (!data) return data;
        return {
          ...data,
          content: data.content.filter((group) => group.id !== groupId),
          numberOfElements: Math.max(0, data.numberOfElements - 1),
          totalElements: Math.max(0, data.totalElements - 1),
        };
      });
    },
    onSettled: () => {
      // The user's sessions of the group are no longer theirs to see (the server answers 403 for them): drop the
      // copies nothing is showing (a notification then opens a loading state, never the old session) and refresh
      // the lists on screen (the Upcoming rail).
      queryClient.removeQueries({ queryKey: sessionKeys.all, type: 'inactive' });
      void queryClient.invalidateQueries({ queryKey: sessionKeys.all });
      return queryClient.invalidateQueries({ queryKey: feedKeys.all });
    },
  });
}
