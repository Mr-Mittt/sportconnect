import type { TrendingHashtag } from '@/shared/types/rail';

/*
 * Mock-backed until FEED-6 swaps this to a real TanStack Query hook against
 * GET /api/hashtags/trending. Moved from home-feed/mockData.ts (FEED-5) so
 * the Groups page's right rail can reuse it too. Same { data, isLoading,
 * isError } shape either way.
 */
const mockTrendingHashtags: TrendingHashtag[] = [
  { tag: '#fridayrun', postCount: 128 },
  { tag: '#tournament', postCount: 94 },
  { tag: '#pickup', postCount: 61 },
  { tag: '#tennislife', postCount: 47 },
];

export function useTrendingHashtags(): {
  data: TrendingHashtag[];
  isLoading: boolean;
  isError: boolean;
} {
  return { data: mockTrendingHashtags, isLoading: false, isError: false };
}
