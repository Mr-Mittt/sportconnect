import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/app/apiClient';
import { feedKeys } from '../queryKeys';
import type { ApiResponse } from '@/shared/types/api';
import type { CreatePostPayload, Post } from '../types';

/**
 * Wraps POST /api/posts. Covers USER_FEED, GROUP_POST, and GROUP_BROADCAST
 * via `payload.postType`/`groupId` (server validates the combination — e.g.
 * GROUP_BROADCAST is owner/admin-only and capped at one active broadcast per
 * group). Invalidates every feed-related query on success so the new post
 * appears in whichever list(s) it belongs to.
 */
export function useCreatePost() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: CreatePostPayload) => {
      const response = await apiClient.post<ApiResponse<Post>>('/posts', payload);
      return response.data.data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: feedKeys.all }),
  });
}
