import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/app/apiClient';
import { feedKeys } from '../queryKeys';
import type { Hashtag, PagedApiResponse } from '../types';

/**
 * Wraps GET /api/hashtags/trending. Not an infinite query — HF-5's
 * TrendingHashtags component renders a bounded top-N list, not a scrollable
 * feed, so the single default page (server default size 10) is the whole
 * result. `data` is the raw PageResponse<Hashtag> — read `data.content` for
 * the row list, `data.empty` for HF-5's empty state.
 */
export function useTrendingHashtags() {
  return useQuery({
    queryKey: feedKeys.trendingHashtags(),
    queryFn: async () => {
      const response = await apiClient.get<PagedApiResponse<Hashtag>>('/hashtags/trending');
      return response.data.data;
    },
  });
}
