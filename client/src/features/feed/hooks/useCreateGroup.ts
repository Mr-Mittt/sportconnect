import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/app/apiClient';
import { feedKeys } from '../queryKeys';
import type { ApiResponse } from '@/shared/types/api';
import type { CreateGroupPayload, Group, PageResponse } from '../types';

/**
 * Wraps POST /api/groups. `onSuccess` prepends the new group directly into
 * `feedKeys.userGroups(userId)`'s cache — same "prepend without a full
 * refetch" reasoning as `prependPostToFeedCache` (FEED-3), so the group is
 * selectable immediately (FEED-5's acceptance criterion) rather than waiting
 * on an invalidate+refetch round trip. `onSettled` still invalidates in the
 * background for eventual consistency. `currentUserId` is a hook param (not
 * read from the mutation payload) purely to know which cache entry to target
 * — same shape as `useComments(postId, isOpen)`.
 */
export function useCreateGroup(currentUserId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: CreateGroupPayload) => {
      const response = await apiClient.post<ApiResponse<Group>>('/groups', payload);
      return response.data.data;
    },
    onSuccess: (group) => {
      if (currentUserId === undefined) return;
      queryClient.setQueryData<PageResponse<Group>>(
        feedKeys.userGroups(currentUserId),
        (data) => {
          if (!data) return data;
          return {
            ...data,
            content: [group, ...data.content],
            numberOfElements: data.numberOfElements + 1,
            totalElements: data.totalElements + 1,
          };
        },
      );
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: feedKeys.all }),
  });
}
