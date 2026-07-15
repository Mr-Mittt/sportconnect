import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/app/apiClient';
import { prependPostToFeedCache } from '../optimisticFeedUpdates';
import { feedKeys } from '../queryKeys';
import type { ApiResponse } from '@/shared/types/api';
import type { CreatePostPayload, Post } from '../types';

/**
 * Wraps POST /api/posts. Covers USER_FEED, GROUP_POST, and GROUP_BROADCAST
 * via `payload.postType`/`groupId` (server validates the combination — e.g.
 * GROUP_BROADCAST is owner/admin-only and capped at one active broadcast per
 * group). onSuccess prepends the real server-returned post directly into the
 * one feed cache it belongs to (personalFeed, or groupFeed(groupId) for a
 * GROUP_POST) — FEED-3's acceptance criterion is "prepend without a full
 * refetch", so this doesn't wait on invalidate+refetch for the visual
 * update, same reasoning as useDeletePost's optimistic removal. Note: a
 * GROUP_BROADCAST post lands in groupFeed here but not feedKeys.broadcasts()
 * — closing that gap is FEED-7's job when it builds broadcast creation.
 * onSettled still invalidates in the background for eventual consistency.
 */
export function useCreatePost() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: CreatePostPayload) => {
      const response = await apiClient.post<ApiResponse<Post>>('/posts', payload);
      return response.data.data;
    },
    onSuccess: (post) => {
      const targetKey = post.groupId != null ? feedKeys.groupFeed(post.groupId) : feedKeys.personalFeed();
      prependPostToFeedCache(queryClient, targetKey, post);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: feedKeys.all }),
  });
}
