import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/app/apiClient';
import { useFeedSpaceStore } from '@/app/feedSpaceStore';
import { feedKeys } from '../queryKeys';
import type { ApiResponse } from '@/shared/types/api';
import type { Group, PageResponse } from '../types';

/**
 * Wraps DELETE /api/groups/{groupId} (owner only; soft delete —
 * `isActive=false` server-side). Same cache-drop + selection-clear shape as
 * `useLeaveGroup`, since both end with the caller no longer viewing this
 * group.
 */
export function useDeleteGroup(currentUserId: string | undefined) {
  const queryClient = useQueryClient();
  const selectGroup = useFeedSpaceStore((state) => state.selectGroup);
  return useMutation({
    mutationFn: async (groupId: number) => {
      await apiClient.delete<ApiResponse<void>>(`/groups/${groupId}`);
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
