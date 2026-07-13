import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/app/apiClient';
import { feedKeys } from '../queryKeys';
import type { PagedApiResponse, Post } from '../types';

/**
 * Wraps GET /api/posts/broadcast (active broadcasts for the caller's
 * sport-matched groups — Post rows with postType=GROUP_BROADCAST). Not an
 * infinite query, matching HF-6's bounded-list GroupBroadcasts component;
 * `data.content` is the row list, `data.empty` drives HF-6's empty state.
 */
export function useActiveBroadcasts() {
  return useQuery({
    queryKey: feedKeys.broadcasts(),
    queryFn: async () => {
      const response = await apiClient.get<PagedApiResponse<Post>>('/posts/broadcast');
      return response.data.data;
    },
  });
}
