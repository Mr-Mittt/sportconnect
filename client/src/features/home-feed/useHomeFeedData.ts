import { useCallback, useMemo } from 'react';
import { useAuthStore } from '@/app/authStore';
import { useCreatePost } from '@/features/feed/hooks/useCreatePost';
import { useDeletePost } from '@/features/feed/hooks/useDeletePost';
import { useLikePost } from '@/features/feed/hooks/useLikePost';
import { usePersonalFeed } from '@/features/feed/hooks/usePersonalFeed';
import { useUnlikePost } from '@/features/feed/hooks/useUnlikePost';
import type { Post } from '@/features/feed/types';
import {
  mockGroupBroadcasts,
  mockSportProfiles,
  mockTrendingHashtags,
  mockUpcomingMatches,
} from './mockData';
import type { GroupBroadcast, SportProfile, TrendingHashtag, UpcomingMatch } from './types';

export interface HomeFeedData {
  sportProfiles: SportProfile[];
  posts: Post[];
  upcomingMatches: UpcomingMatch[];
  hashtags: TrendingHashtag[];
  broadcasts: GroupBroadcast[];
}

/**
 * The Home Feed's single data boundary (HF-7). FEED-1 de-mocks `posts` behind
 * `usePersonalFeed()` — sportProfiles/upcomingMatches/hashtags/broadcasts stay
 * mock until SPORT-1/FEED-6/FEED-7 land (matches stay mock for this whole
 * MVP, no backend module exists). HomeFeedPage never notices which internals
 * are real vs. mock — that's the point of this hook boundary.
 *
 * toggleLike(postId) decides like vs. unlike itself, since PostCard's
 * controlled-like contract (HF-3) only ever reports "the user clicked this
 * post's like control," not which direction — the real API has two separate
 * endpoints, so this hook resolves the direction from the post's current
 * `isLikedByCurrentUser` before delegating to the matching optimistic
 * mutation (useLikePost/useUnlikePost, FEED-1).
 *
 * The `?visual-state=empty` seam only still applies to `upcomingMatches` —
 * matches have no backend, so there's no other way to reach that empty
 * state. `posts`' empty state now comes from a real (MSW-backed in tests)
 * empty feed response, not this seam (HF-10b's own delta said to make this
 * exact swap once FEED-1 de-mocked the hook).
 */
export function useHomeFeedData(): {
  data: HomeFeedData;
  isLoading: boolean;
  isError: boolean;
  toggleLike: (postId: number) => void;
  deletePost: (postId: number) => void;
  createPost: (content: string) => void;
  isCreatingPost: boolean;
  currentUserId: string | undefined;
  hasMorePosts: boolean;
  isFetchingMorePosts: boolean;
  fetchMorePosts: () => void;
} {
  const isVisualEmpty =
    new URLSearchParams(window.location.search).get('visual-state') === 'empty';

  const currentUserId = useAuthStore((state) => state.user?.id);
  const feedQuery = usePersonalFeed();
  const likeMutation = useLikePost();
  const unlikeMutation = useUnlikePost();
  const deleteMutation = useDeletePost();
  const createMutation = useCreatePost();

  const posts = useMemo(
    () => feedQuery.data?.pages.flatMap((page) => page.content) ?? [],
    [feedQuery.data],
  );

  const toggleLike = useCallback(
    (postId: number) => {
      const post = posts.find((candidate) => candidate.id === postId);
      if (!post) return;
      if (post.isLikedByCurrentUser) {
        unlikeMutation.mutate(postId);
      } else {
        likeMutation.mutate(postId);
      }
    },
    [posts, likeMutation, unlikeMutation],
  );

  const deletePost = useCallback(
    (postId: number) => deleteMutation.mutate(postId),
    [deleteMutation],
  );

  const createPost = useCallback(
    (content: string) => createMutation.mutate({ content }),
    [createMutation],
  );

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

  return {
    data,
    isLoading: feedQuery.isLoading,
    isError: feedQuery.isError,
    toggleLike,
    deletePost,
    createPost,
    isCreatingPost: createMutation.isPending,
    currentUserId,
    hasMorePosts: feedQuery.hasNextPage ?? false,
    isFetchingMorePosts: feedQuery.isFetchingNextPage,
    fetchMorePosts: () => feedQuery.fetchNextPage(),
  };
}
