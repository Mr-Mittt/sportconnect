import { useCallback, useMemo } from 'react';
import { useAuthStore } from '@/app/authStore';
import { useDeletePost } from './hooks/useDeletePost';
import { useLikePost } from './hooks/useLikePost';
import { usePostsByHashtag } from './hooks/usePostsByHashtag';
import { useUnlikePost } from './hooks/useUnlikePost';
import type { Post } from './types';

/**
 * `HashtagPostsModal`'s data boundary (FEED-6) — mirrors `useCommentsData`'s
 * role/shape (scoped to one tag instead of one post) and `useHomeFeedData`'s
 * like/delete wiring. `isOpen` gates `usePostsByHashtag`'s `enabled` flag so a
 * tag's posts are only fetched while the modal is actually open, not on
 * every render of the owning page (same reasoning as `useComments`).
 *
 * `toggleLike`/`deletePost` delegate straight to the shared like/unlike/
 * delete mutations — their optimistic cache updates already target every
 * mounted Post-feed query, hashtag-filtered included
 * (`optimisticFeedUpdates.ts`'s `POST_FEED_TAGS` already lists `'hashtag'`),
 * so no hashtag-specific cache-write logic is needed here.
 *
 * FEED-8 adds `retryPosts`/`isLoadMorePostsError`, same shape as
 * `useHomeFeedData`'s — `HashtagPostsModal` reuses `Feed` directly, so it
 * needs the same two fields to satisfy `Feed`'s props.
 */
export function useHashtagResultsData(
  tag: string | null,
  isOpen: boolean,
): {
  data: { posts: Post[] };
  isLoading: boolean;
  isError: boolean;
  toggleLike: (postId: number) => void;
  deletePost: (postId: number) => void;
  currentUserId: string | undefined;
  hasMorePosts: boolean;
  isFetchingMorePosts: boolean;
  fetchMorePosts: () => void;
  isLoadMorePostsError: boolean;
  retryPosts: () => void;
} {
  const currentUserId = useAuthStore((state) => state.user?.id);
  const postsQuery = usePostsByHashtag(tag ?? '', isOpen && tag !== null);
  const likeMutation = useLikePost();
  const unlikeMutation = useUnlikePost();
  const deleteMutation = useDeletePost();

  const posts = useMemo(
    () => postsQuery.data?.pages.flatMap((page) => page.content) ?? [],
    [postsQuery.data],
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

  return {
    data: { posts },
    isLoading: postsQuery.isLoading,
    isError: postsQuery.isError,
    toggleLike,
    deletePost,
    currentUserId,
    hasMorePosts: postsQuery.hasNextPage ?? false,
    isFetchingMorePosts: postsQuery.isFetchingNextPage,
    fetchMorePosts: () => postsQuery.fetchNextPage(),
    isLoadMorePostsError: postsQuery.isFetchNextPageError,
    retryPosts: () => postsQuery.refetch(),
  };
}
