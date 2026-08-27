import { useCallback, useMemo } from 'react';
import { useAuthStore } from '@/app/authStore';
import { useDeletePost } from '@/features/feed/hooks/useDeletePost';
import { useLikePost } from '@/features/feed/hooks/useLikePost';
import { useUnlikePost } from '@/features/feed/hooks/useUnlikePost';
import { useCreatePost } from '@/features/feed/hooks/useCreatePost';
import { sportIdForKey } from '@/features/feed/sportIdMap';
import type { Post } from '@/features/feed/types';
import { useSportProfiles } from '@/shared/hooks/useSportProfiles';
import type { SportKey, SportProfile } from '@/shared/types/sport';
import { useMyPosts } from './useMyPosts';
import { useProfileActiveSport } from './useProfileActiveSport';

export interface PostsTabData {
  posts: Post[];
  sportsByKey: Record<SportKey, SportProfile>;
}

/**
 * The Posts tab's data boundary (PROFILE-2) — same shape as
 * `useHomeFeedData`, scoped to the caller's own posts (`useMyPosts`) instead
 * of the personalized feed. `createPost` tags new posts with the page's
 * active sport (`useProfileActiveSport`) — there is no `'all'` pill on this
 * page (PROFILE-4 delta), so every post is tagged with a real `sportId`
 * except the zero-sport-profile edge case, where `activeSport` is
 * `undefined` and the post is created untagged.
 *
 * `toggleLikeForPost` exists for the same FEED-12 reason `useHomeFeedData`
 * has one: `CommentSection`'s dialog resolves its post via `usePost`, which
 * is a different query than this hook's own `posts` array, so `toggleLike`'s
 * internal `find` wouldn't always locate it.
 */
export function usePostsTabData(): {
  data: PostsTabData;
  activeSport: SportKey | undefined;
  isLoading: boolean;
  isError: boolean;
  toggleLike: (postId: number) => void;
  toggleLikeForPost: (post: Post) => void;
  deletePost: (postId: number) => void;
  createPost: (content: string) => void;
  isCreatingPost: boolean;
  isCreatePostError: boolean;
  currentUserId: string | undefined;
  hasMorePosts: boolean;
  isFetchingMorePosts: boolean;
  fetchMorePosts: () => void;
  isLoadMorePostsError: boolean;
  retryPosts: () => void;
} {
  const currentUserId = useAuthStore((state) => state.user?.id);
  const { activeSport } = useProfileActiveSport();
  const postsQuery = useMyPosts();
  const sportProfilesQuery = useSportProfiles();
  const likeMutation = useLikePost();
  const unlikeMutation = useUnlikePost();
  const deleteMutation = useDeletePost();
  const createMutation = useCreatePost();

  const posts = useMemo(
    () => postsQuery.data?.pages.flatMap((page) => page.content) ?? [],
    [postsQuery.data],
  );

  const sportsByKey = useMemo(
    () =>
      Object.fromEntries(sportProfilesQuery.data.map((sport) => [sport.key, sport])) as Record<
        SportKey,
        SportProfile
      >,
    [sportProfilesQuery.data],
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

  const toggleLikeForPost = useCallback(
    (post: Post) => {
      if (post.isLikedByCurrentUser) {
        unlikeMutation.mutate(post.id);
      } else {
        likeMutation.mutate(post.id);
      }
    },
    [likeMutation, unlikeMutation],
  );

  const deletePost = useCallback(
    (postId: number) => deleteMutation.mutate(postId),
    [deleteMutation],
  );

  const createPost = useCallback(
    (content: string) => {
      const sportId = activeSport !== undefined ? sportIdForKey(activeSport) : undefined;
      createMutation.mutate({ content, sportId });
    },
    [createMutation, activeSport],
  );

  const data = useMemo<PostsTabData>(() => ({ posts, sportsByKey }), [posts, sportsByKey]);

  return {
    data,
    activeSport,
    isLoading: postsQuery.isLoading,
    isError: postsQuery.isError,
    toggleLike,
    toggleLikeForPost,
    deletePost,
    createPost,
    isCreatingPost: createMutation.isPending,
    isCreatePostError: createMutation.isError,
    currentUserId,
    hasMorePosts: postsQuery.hasNextPage ?? false,
    isFetchingMorePosts: postsQuery.isFetchingNextPage,
    fetchMorePosts: () => postsQuery.fetchNextPage(),
    isLoadMorePostsError: postsQuery.isFetchNextPageError,
    retryPosts: () => postsQuery.refetch(),
  };
}
