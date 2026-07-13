import { useInfiniteQuery } from '@tanstack/react-query';
import { apiClient } from '@/app/apiClient';
import { getNextPageParam } from '../pagination';
import { feedKeys } from '../queryKeys';
import type { PagedApiResponse, Post } from '../types';

const PAGE_SIZE = 20;

/**
 * Wraps GET /api/posts/feed (the caller's personalized feed — own posts,
 * friends' USER_FEED posts, and GROUP_POSTs from sport-matched groups,
 * ordered by last interaction) in TanStack's native useInfiniteQuery shape —
 * no custom wrapping, callers get { data, isLoading, isError, fetchNextPage,
 * hasNextPage, ... } directly. Pages advance by Spring page number, derived
 * from the previous page's own `last`/`number` fields, not a client-side
 * counter.
 */
export function usePersonalFeed() {
  return useInfiniteQuery({
    queryKey: feedKeys.personalFeed(),
    queryFn: async ({ pageParam }) => {
      const response = await apiClient.get<PagedApiResponse<Post>>('/posts/feed', {
        params: { page: pageParam, size: PAGE_SIZE },
      });
      return response.data.data;
    },
    initialPageParam: 0,
    getNextPageParam,
  });
}
