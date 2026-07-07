import { useCallback, useMemo, useState } from 'react';
import {
  mockGroupBroadcasts,
  mockPosts,
  mockSportProfiles,
  mockTrendingHashtags,
  mockUpcomingMatches,
} from './mockData';
import type {
  GroupBroadcast,
  Post,
  SportProfile,
  TrendingHashtag,
  UpcomingMatch,
} from './types';

export interface HomeFeedData {
  sportProfiles: SportProfile[];
  posts: Post[];
  upcomingMatches: UpcomingMatch[];
  hashtags: TrendingHashtag[];
  broadcasts: GroupBroadcast[];
}

/**
 * The Home Feed's single data boundary (HF-7). Currently mock-backed; the
 * integration phase swaps the internals per dataset (FEED-1 posts, FEED-6
 * hashtags, FEED-7 broadcasts, SPORT-1 profiles; matches stay mock — no
 * backend exists) without changing this return shape, so HomeFeedPage never
 * notices the swap. isLoading/isError are always false here but are part of
 * the contract per the data-layer convention.
 *
 * toggleLike flips likedByMe and adjusts likeCount synchronously — the
 * controlled-like contract from HF-3. FEED-1 replaces this with a TanStack
 * optimistic mutation behind the same signature.
 */
export function useHomeFeedData(): {
  data: HomeFeedData;
  isLoading: boolean;
  isError: boolean;
  toggleLike: (postId: string) => void;
} {
  // Test seam for the visual-regression spec (HF-10b): no mock sport is empty,
  // so the empty state is unreachable through the UI. Empties only posts +
  // matches — the same subset HF-10a's mockup empty state cleared. Goes away
  // when FEED-1 swaps these internals for real queries; the visual spec's
  // empty state then comes from MSW handlers instead.
  const isVisualEmpty =
    new URLSearchParams(window.location.search).get('visual-state') === 'empty';

  const [posts, setPosts] = useState<Post[]>(isVisualEmpty ? [] : mockPosts);

  const toggleLike = useCallback((postId: string) => {
    setPosts((prev) =>
      prev.map((post) =>
        post.id === postId
          ? {
              ...post,
              likedByMe: !post.likedByMe,
              likeCount: post.likeCount + (post.likedByMe ? -1 : 1),
            }
          : post,
      ),
    );
  }, []);

  const data = useMemo<HomeFeedData>(
    () => ({
      sportProfiles: mockSportProfiles,
      posts,
      upcomingMatches: isVisualEmpty ? [] : mockUpcomingMatches,
      hashtags: mockTrendingHashtags,
      broadcasts: mockGroupBroadcasts,
    }),
    [posts, isVisualEmpty],
  );

  return { data, isLoading: false, isError: false, toggleLike };
}
