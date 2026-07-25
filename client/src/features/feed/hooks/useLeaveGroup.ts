import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/app/apiClient';
import { useGroupsPageStore } from '@/app/groupsPageStore';
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
    onSettled: () => queryClient.invalidateQueries({ queryKey: feedKeys.all }),
  });
}
