import { useMemo } from 'react';
import { useTrendingHashtags as useTrendingHashtagsQuery } from '@/features/feed/hooks/useTrendingHashtags';
import type { TrendingHashtag } from '@/shared/types/rail';

/**
 * FEED-6: real hook against `GET /api/hashtags/trending`
 * (`features/feed/hooks/useTrendingHashtags`, FEED-0), replacing the mock
 * array that used to live here. Same `{ data, isLoading, isError }` shape as
 * before (client/CLAUDE.md's data layer convention) — `TrendingHashtags`,
 * `HomeFeedPage`, and `GroupsPage` don't change.
 *
 * Mapping: the real `Hashtag { tag (no leading '#'), usageCount }` becomes
 * `TrendingHashtag { tag (with '#'), postCount }` — same '#'-prefixing
 * bridge FEED-1 already established for `Post.hashtags`.
 *
 * FEED-8 adds `refetch` — the retry action behind `TrendingHashtags`' error
 * state, unrelated to the data mapping above.
 */
export function useTrendingHashtags(): {
  data: TrendingHashtag[];
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
} {
  const query = useTrendingHashtagsQuery();

  const data = useMemo<TrendingHashtag[]>(
    () =>
      (query.data?.content ?? []).map((hashtag) => ({
        tag: `#${hashtag.tag}`,
        postCount: hashtag.usageCount,
      })),
    [query.data],
  );

  return {
    data,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: () => query.refetch(),
  };
}
