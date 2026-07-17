import { useInfiniteQuery } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
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
 *
 * `retry` skips the default 3-attempt backoff for a 404 (the backend 404s
 * this endpoint too when `postId` doesn't exist — confirmed live, FEED-12)
 * — otherwise "Couldn't load comments." only appears several seconds after
 * CommentSection's own "Couldn't load this post." state, which is confusing
 * for the one case both fire together (a post that was deleted, or a bad
 * link). Other errors still get the default retry behavior.
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
    retry: (failureCount, error) => {
      if ((error as AxiosError).response?.status === 404) return false;
      return failureCount < 3;
    },
  });
}
