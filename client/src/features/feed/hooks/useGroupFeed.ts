import { useInfiniteQuery } from '@tanstack/react-query';
import { apiClient } from '@/app/apiClient';
import { getNextPageParam } from '../pagination';
import { feedKeys } from '../queryKeys';
import type { PagedApiResponse, Post } from '../types';

const PAGE_SIZE = 20;

/**
 * Wraps GET /api/posts/group/{groupId} (membership-gated — the caller must
 * belong to the group). Disabled while `groupId` is undefined (e.g. no
 * group selected yet), so callers don't need their own `enabled` guard.
 */
export function useGroupFeed(groupId: number | undefined) {
  return useInfiniteQuery({
    queryKey: feedKeys.groupFeed(groupId ?? -1),
    queryFn: async ({ pageParam }) => {
      const response = await apiClient.get<PagedApiResponse<Post>>(`/posts/group/${groupId}`, {
        params: { page: pageParam, size: PAGE_SIZE },
      });
      return response.data.data;
    },
    initialPageParam: 0,
    getNextPageParam,
    enabled: groupId !== undefined,
  });
}
