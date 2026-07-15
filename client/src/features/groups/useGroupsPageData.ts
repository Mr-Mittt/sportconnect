import { useCallback, useMemo } from 'react';
import { useAuthStore } from '@/app/authStore';
import { useFeedSpaceStore } from '@/app/feedSpaceStore';
import { useCreatePost } from '@/features/feed/hooks/useCreatePost';
import { useDeletePost } from '@/features/feed/hooks/useDeletePost';
import { useGroupFeed } from '@/features/feed/hooks/useGroupFeed';
import { useLikePost } from '@/features/feed/hooks/useLikePost';
import { usePersonalFeed } from '@/features/feed/hooks/usePersonalFeed';
import { useUnlikePost } from '@/features/feed/hooks/useUnlikePost';
import { useUserGroups } from '@/features/feed/hooks/useUserGroups';
import { SPORT_ID_BY_KEY } from '@/features/feed/sportIdMap';
import type { Group, Post } from '@/features/feed/types';
import { useGroupBroadcasts } from '@/shared/hooks/useGroupBroadcasts';
import { useSportProfiles } from '@/shared/hooks/useSportProfiles';
import { useTrendingHashtags } from '@/shared/hooks/useTrendingHashtags';
import { useUpcomingMatches } from '@/shared/hooks/useUpcomingMatches';
import type { SportProfile } from '@/shared/types/sport';
import type { GroupBroadcast, TrendingHashtag, UpcomingMatch } from '@/shared/types/rail';

export interface GroupsPageData {
  sportProfiles: SportProfile[];
  groups: Group[];
  posts: Post[];
  upcomingMatches: UpcomingMatch[];
  hashtags: TrendingHashtag[];
  broadcasts: GroupBroadcast[];
}

/**
 * The Groups page's data boundary (FEED-4) — mirrors useHomeFeedData's role
 * and shape. `groups` is the user's joined groups filtered to the shared
 * `feedSpaceStore.activeSport` (a group is 1:1 with a sport, so this is
 * exact, not a heuristic). `selectedGroupId` (also shared state — carried
 * over if a page later needs it) decides `posts`' source:
 *
 * - a specific group selected → `useGroupFeed(selectedGroupId)`, the real
 *   per-group feed.
 * - "All" (selectedGroupId null) → no aggregate "all my groups" endpoint
 *   exists on the backend, so this reuses `usePersonalFeed()` (which
 *   already blends in GROUP_POSTs from sport-matched groups per its own
 *   doc comment) and narrows it client-side to just the GROUP_POST entries
 *   matching the active sport filter — same client-side filtering idiom
 *   Feed.tsx already uses for Home Feed's posts.
 *
 * createPost is a no-op on "All" (selectedGroupId null) — there is no
 * single group to attribute a new post to there; GroupsPage hides the
 * composer in that state so this is a safety net, not the primary guard.
 *
 * `upcomingMatches`/`hashtags`/`broadcasts` (FEED-5) mirror Home Feed's right
 * rail exactly, same mock-backed hooks — the Groups page reuses the same
 * rail content, not a group-scoped variant.
 */
export function useGroupsPageData(): {
  data: GroupsPageData;
  selectedGroupId: number | null;
  selectGroup: (groupId: number | null) => void;
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
  const currentUserId = useAuthStore((state) => state.user?.id);
  const activeSport = useFeedSpaceStore((state) => state.activeSport);
  const selectedGroupId = useFeedSpaceStore((state) => state.selectedGroupId);
  const selectGroup = useFeedSpaceStore((state) => state.selectGroup);

  const sportProfilesQuery = useSportProfiles();
  const upcomingMatchesQuery = useUpcomingMatches();
  const trendingHashtagsQuery = useTrendingHashtags();
  const groupBroadcastsQuery = useGroupBroadcasts();
  const groupsQuery = useUserGroups(currentUserId);
  const groups = useMemo(() => {
    const allGroups = groupsQuery.data?.content ?? [];
    return activeSport === 'all'
      ? allGroups
      : allGroups.filter((group) => group.sportId === SPORT_ID_BY_KEY[activeSport]);
  }, [groupsQuery.data, activeSport]);

  const groupFeedQuery = useGroupFeed(selectedGroupId ?? undefined);
  const personalFeedQuery = usePersonalFeed(selectedGroupId === null);
  const activeFeedQuery = selectedGroupId !== null ? groupFeedQuery : personalFeedQuery;

  const posts = useMemo(() => {
    const allPosts = activeFeedQuery.data?.pages.flatMap((page) => page.content) ?? [];
    if (selectedGroupId !== null) return allPosts;
    return allPosts.filter((post) => {
      if (post.postType !== 'GROUP_POST') return false;
      return activeSport === 'all' || post.sportId === SPORT_ID_BY_KEY[activeSport];
    });
  }, [activeFeedQuery.data, selectedGroupId, activeSport]);

  const likeMutation = useLikePost();
  const unlikeMutation = useUnlikePost();
  const deleteMutation = useDeletePost();
  const createMutation = useCreatePost();

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
    (content: string) => {
      if (selectedGroupId === null) return;
      createMutation.mutate({ content, groupId: selectedGroupId });
    },
    [createMutation, selectedGroupId],
  );

  return {
    data: {
      sportProfiles: sportProfilesQuery.data,
      groups,
      posts,
      upcomingMatches: upcomingMatchesQuery.data,
      hashtags: trendingHashtagsQuery.data,
      broadcasts: groupBroadcastsQuery.data,
    },
    selectedGroupId,
    selectGroup,
    isLoading: activeFeedQuery.isLoading,
    isError: activeFeedQuery.isError,
    toggleLike,
    deletePost,
    createPost,
    isCreatingPost: createMutation.isPending,
    currentUserId,
    hasMorePosts: activeFeedQuery.hasNextPage ?? false,
    isFetchingMorePosts: activeFeedQuery.isFetchingNextPage,
    fetchMorePosts: () => activeFeedQuery.fetchNextPage(),
  };
}
