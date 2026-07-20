import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/app/apiClient';
import { feedKeys } from '../queryKeys';
import type { ApiResponse } from '@/shared/types/api';
import type { Group, PageResponse, UpdateGroupPayload } from '../types';

interface UpdateGroupVariables {
  groupId: number;
  payload: UpdateGroupPayload;
}

/**
 * Wraps PUT /api/groups/{groupId} (owner or admin only; partial update).
 * `currentUserId` locates the `userGroups` cache entry to patch in place —
 * same "patch, don't refetch" reasoning as `useCreateGroup`'s prepend, so a
 * Privacy toggle flips immediately without an invalidate+refetch round trip.
 */
export function useUpdateGroup(currentUserId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ groupId, payload }: UpdateGroupVariables) => {
      const response = await apiClient.put<ApiResponse<Group>>(`/groups/${groupId}`, payload);
      return response.data.data;
    },
    onSuccess: (group) => {
      if (currentUserId === undefined) return;
      queryClient.setQueryData<PageResponse<Group>>(feedKeys.userGroups(currentUserId), (data) => {
        if (!data) return data;
        return {
          ...data,
          content: data.content.map((existing) => (existing.id === group.id ? group : existing)),
        };
      });
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: feedKeys.all }),
  });
}
