import { useCallback, useMemo } from 'react';
import { useAuthStore } from '@/app/authStore';
import { useCreatePost } from '@/features/feed/hooks/useCreatePost';
import { useDeletePost } from '@/features/feed/hooks/useDeletePost';
import { useLikePost } from '@/features/feed/hooks/useLikePost';
import { usePersonalFeed } from '@/features/feed/hooks/usePersonalFeed';
import { useUnlikePost } from '@/features/feed/hooks/useUnlikePost';
import { useUserGroups } from '@/features/feed/hooks/useUserGroups';
import type { GroupRef, Post } from '@/features/feed/types';
import { useGroupBroadcasts } from '@/shared/hooks/useGroupBroadcasts';
import { useSportProfiles } from '@/shared/hooks/useSportProfiles';
import { useTrendingHashtags } from '@/shared/hooks/useTrendingHashtags';
import { useUpcomingMatches } from '@/shared/hooks/useUpcomingMatches';
import type { GroupBroadcast, SportProfile, TrendingHashtag, UpcomingMatch } from './types';

export interface HomeFeedData {
  sportProfiles: SportProfile[];
  posts: Post[];
  upcomingMatches: UpcomingMatch[];
  hashtags: TrendingHashtag[];
  broadcasts: GroupBroadcast[];
  /** post.groupId -> { groupName, sportId }, for each GROUP_POST/
   * GROUP_BROADCAST's "username > groupname" author line — Home Feed blends
   * posts from every group the user is in, so the group needs disambiguating
   * (unlike a specific group's own feed on the Groups page). sportId lets
   * the link switch the Groups page to that sport before selecting it. */
  groupsById: Record<number, GroupRef>;
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
 *
 * FEED-8 adds per-section loading/error/retry: `isLoadMorePostsError` (from
 * `feedQuery.isFetchNextPageError` — a failed "load more" keeps the
 * already-loaded posts visible, distinct from the initial-load `isError`
 * above) plus `retryPosts`/`isHashtagsLoading`/`isHashtagsError`/
 * `retryHashtags`/`isBroadcastsLoading`/`isBroadcastsError`/
 * `retryBroadcasts` so `Feed`/`TrendingHashtags`/`GroupBroadcasts` can each
 * render their own loading skeleton or error+retry state independently —
 * one section failing doesn't block the others.
 *
 * FEED-10 adds `isCreatePostError` — surfaces a failed `createPost` to
 * `CreatePostForm` (the composer already clears its content on submit, so
 * this is a visibility fix, not a content-preserving retry).
 */
export function useHomeFeedData(): {
  data: HomeFeedData;
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
  isHashtagsLoading: boolean;
  isHashtagsError: boolean;
  retryHashtags: () => void;
  isBroadcastsLoading: boolean;
  isBroadcastsError: boolean;
  retryBroadcasts: () => void;
} {
  const isVisualEmpty =
    new URLSearchParams(window.location.search).get('visual-state') === 'empty';

  const currentUserId = useAuthStore((state) => state.user?.id);
  const feedQuery = usePersonalFeed();
  const sportProfilesQuery = useSportProfiles();
  const upcomingMatchesQuery = useUpcomingMatches();
  const trendingHashtagsQuery = useTrendingHashtags();
  const groupBroadcastsQuery = useGroupBroadcasts();
  const groupsQuery = useUserGroups(currentUserId);
  const likeMutation = useLikePost();
  const unlikeMutation = useUnlikePost();
  const deleteMutation = useDeletePost();
  const createMutation = useCreatePost();

  const posts = useMemo(
    () => feedQuery.data?.pages.flatMap((page) => page.content) ?? [],
    [feedQuery.data],
  );

  const groupsById = useMemo(
    () =>
      Object.fromEntries(
        (groupsQuery.data?.content ?? []).map((group) => [
          group.id,
          { groupName: group.groupName, sportId: group.sportId },
        ]),
      ),
    [groupsQuery.data],
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

  // FEED-12: for the comment dialog's own like button, whose post may come
  // from `usePost` rather than this hook's own `posts` array (e.g. a post
  // reached via a direct `/posts/:id` link that isn't in the caller's
  // personal feed at all) — `toggleLike` above would silently no-op in that
  // case, since its internal lookup wouldn't find it. Takes the already-
  // resolved `Post` directly instead of re-deriving it, sharing the same
  // mutations (so cache updates/optimistic behavior stay identical).
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
    (content: string) => createMutation.mutate({ content }),
    [createMutation],
  );

  const data = useMemo<HomeFeedData>(
    () => ({
      sportProfiles: sportProfilesQuery.data,
      posts,
      upcomingMatches: isVisualEmpty ? [] : upcomingMatchesQuery.data,
      hashtags: trendingHashtagsQuery.data,
      broadcasts: groupBroadcastsQuery.data,
      groupsById,
    }),
    [
      sportProfilesQuery.data,
      posts,
      isVisualEmpty,
      upcomingMatchesQuery.data,
      trendingHashtagsQuery.data,
      groupBroadcastsQuery.data,
      groupsById,
    ],
  );

  return {
    data,
    isLoading: feedQuery.isLoading,
    isError: feedQuery.isError,
    toggleLike,
    toggleLikeForPost,
    deletePost,
    createPost,
    isCreatingPost: createMutation.isPending,
    isCreatePostError: createMutation.isError,
    currentUserId,
    hasMorePosts: feedQuery.hasNextPage ?? false,
    isFetchingMorePosts: feedQuery.isFetchingNextPage,
    fetchMorePosts: () => feedQuery.fetchNextPage(),
    isLoadMorePostsError: feedQuery.isFetchNextPageError,
    retryPosts: () => feedQuery.refetch(),
    isHashtagsLoading: trendingHashtagsQuery.isLoading,
    isHashtagsError: trendingHashtagsQuery.isError,
    retryHashtags: trendingHashtagsQuery.refetch,
    isBroadcastsLoading: groupBroadcastsQuery.isLoading,
    isBroadcastsError: groupBroadcastsQuery.isError,
    retryBroadcasts: groupBroadcastsQuery.refetch,
  };
}
