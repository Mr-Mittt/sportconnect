import { useInfiniteQuery } from '@tanstack/react-query';
import { apiClient } from '@/app/apiClient';
import { getNextPageParam } from '../pagination';
import { feedKeys } from '../queryKeys';
import type { Comment, PagedApiResponse } from '../types';

const PAGE_SIZE = 20;

/**
 * Wraps GET /api/posts/{postId}/comments (root-level only, paginated;
 * each root comment's `replies` array is fully populated server-side — one
 * level deep, per the backend's A4 constraint). `enabled` gates the fetch so
 * a post's thread is only requested while its CommentSection dialog is
 * actually open, not for every post in the feed up front.
 */
export function useComments(postId: number, enabled: boolean) {
  return useInfiniteQuery({
    queryKey: feedKeys.comments(postId),
    queryFn: async ({ pageParam }) => {
      const response = await apiClient.get<PagedApiResponse<Comment>>(
        `/posts/${postId}/comments`,
        { params: { page: pageParam, size: PAGE_SIZE } },
      );
      return response.data.data;
    },
    initialPageParam: 0,
    getNextPageParam,
    enabled,
  });
}
