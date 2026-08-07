import { useCallback, useMemo } from 'react';
import { useAuthStore } from '@/app/authStore';
import { useGroupsPageStore } from '@/app/groupsPageStore';
import { useActiveBroadcasts } from '@/features/feed/hooks/useActiveBroadcasts';
import { useCreatePost } from '@/features/feed/hooks/useCreatePost';
import { useDeletePost } from '@/features/feed/hooks/useDeletePost';
import { useGroupFeed } from '@/features/feed/hooks/useGroupFeed';
import { useLikePost } from '@/features/feed/hooks/useLikePost';
import { usePersonalFeed } from '@/features/feed/hooks/usePersonalFeed';
import { useUnlikePost } from '@/features/feed/hooks/useUnlikePost';
import { useUpdatePost } from '@/features/feed/hooks/useUpdatePost';
import { useUserGroups } from '@/features/feed/hooks/useUserGroups';
import { sportIdForKey } from '@/features/feed/sportIdMap';
import type { Group, GroupRef, Post } from '@/features/feed/types';
import { useGroupBroadcasts } from '@/shared/hooks/useGroupBroadcasts';
import { useSportProfiles } from '@/shared/hooks/useSportProfiles';
import { useTrendingHashtags } from '@/shared/hooks/useTrendingHashtags';
import { useUpcomingMatches } from '@/shared/hooks/useUpcomingMatches';
import type { SportProfile } from '@/shared/types/sport';
import type { GroupBroadcast, TrendingHashtag } from '@/shared/types/rail';
import type { Session } from '@/shared/types/session';

export interface GroupsPageData {
  sportProfiles: SportProfile[];
  groups: Group[];
  posts: Post[];
  upcomingMatches: Session[];
  hashtags: TrendingHashtag[];
  broadcasts: GroupBroadcast[];
  /** post.groupId -> { groupName, sportId }, for each GROUP_POST/
   * GROUP_BROADCAST's "username > groupname" author line — built from the
   * unfiltered groups list (not `groups` above, which is narrowed by
   * `activeSport`), same reasoning as `selectedGroupSportId` below. Only
   * rendered when `GroupsPage` is showing "All" groups (see `Feed`'s
   * `showGroupName`); sportId lets clicking the link switch to that group's
   * sport before selecting it. */
  groupsById: Record<number, GroupRef>;
}

/**
 * The Groups page's data boundary (FEED-4) — mirrors useHomeFeedData's role
 * and shape. `groups` is the user's joined groups filtered to this page's
 * own `groupsPageStore.activeSport` (independent of Home Feed's — a group
 * is 1:1 with a sport, so this is exact, not a heuristic). `selectedGroupId`
 * decides `posts`' source:
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
 * `upcomingMatches`/`hashtags` stay mock/real per FEED-6; `broadcasts` is
 * real now too (FEED-7). Same shared hooks as Home Feed's right rail — the
 * Groups page reuses the same rail content, not a group-scoped variant.
 *
 * FEED-7: `canBroadcast` and `activeBroadcastForSelectedGroup` are exposed so
 * `GroupsPage` can gate `CreatePostForm`'s "Broadcast" toggle and detect the
 * backend's one-active-broadcast-per-group cap *before* submitting (the
 * confirm-and-update-instead flow lives in `GroupsPage`, not here — this hook
 * only supplies the data/mutations, per the same "page owns UI state" split
 * every other modal on this page already follows). `activeBroadcastForSelectedGroup`
 * reads the RAW `useActiveBroadcasts()` list (not `data.broadcasts`, which is
 * the rail-display-mapped shape without `locationName`/`sportId`/`visibility` —
 * `updateBroadcast` needs those to avoid the update endpoint's
 * omitted-field-nulls-it-out quirk, see `useUpdatePost`'s doc comment).
 *
 * FEED-8 adds per-section loading/error/retry, same reasoning as
 * `useHomeFeedData`: `isLoadMorePostsError`/`retryPosts` for the feed's
 * pagination edge, `isHashtagsLoading`/`isHashtagsError`/`retryHashtags`,
 * `isBroadcastsLoading`/`isBroadcastsError`/`retryBroadcasts`, and
 * `isGroupsLoading`/`isGroupsError`/`retryGroups` (new here — `GroupSpaceSwitcher`
 * has no Home Feed equivalent) so `GroupSpaceSwitcher` doesn't render its
 * "0 groups, join/create" fallback while the groups list is still loading or
 * has failed to load.
 */
export function useGroupsPageData(): {
  data: GroupsPageData;
  selectedGroupId: number | null;
  selectGroup: (groupId: number | null, groupSportId?: number | null) => void;
  isLoading: boolean;
  isError: boolean;
  toggleLike: (postId: number) => void;
  toggleLikeForPost: (post: Post) => void;
  deletePost: (postId: number) => void;
  createPost: (content: string, options?: { asBroadcast: boolean }) => void;
  isCreatingPost: boolean;
  isCreatePostError: boolean;
  canBroadcast: boolean;
  activeBroadcastForSelectedGroup: Post | null;
  updateBroadcast: (content: string, options?: { onSuccess?: () => void }) => void;
  isUpdatingBroadcast: boolean;
  isBroadcastUpdateError: boolean;
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
  isGroupsLoading: boolean;
  isGroupsError: boolean;
  retryGroups: () => void;
} {
  const currentUserId = useAuthStore((state) => state.user?.id);
  const activeSport = useGroupsPageStore((state) => state.activeSport);
  const selectedGroupId = useGroupsPageStore((state) => state.selectedGroupId);
  const selectGroup = useGroupsPageStore((state) => state.selectGroup);

  const sportProfilesQuery = useSportProfiles();
  const upcomingMatchesQuery = useUpcomingMatches();
  const trendingHashtagsQuery = useTrendingHashtags();
  const groupBroadcastsQuery = useGroupBroadcasts();
  // Raw Post[] (not the rail-mapped GroupBroadcast[] above) — shares
  // useGroupBroadcasts' query cache (same key), no extra network call.
  const activeBroadcastsQuery = useActiveBroadcasts();
  const groupsQuery = useUserGroups(currentUserId);
  const groups = useMemo(() => {
    const allGroups = groupsQuery.data?.content ?? [];
    return activeSport === 'all'
      ? allGroups
      : allGroups.filter((group) => group.sportId === sportIdForKey(activeSport));
  }, [groupsQuery.data, activeSport]);

  const canBroadcast = useMemo(() => {
    const selectedGroup = groups.find((group) => group.id === selectedGroupId);
    return (
      selectedGroup !== undefined &&
      (selectedGroup.currentUserRole === 'group_owner' ||
        selectedGroup.currentUserRole === 'group_admin')
    );
  }, [groups, selectedGroupId]);

  // Looked up from the unfiltered list (not `groups`, which is narrowed by
  // `activeSport`) so this stays correct even in the brief window where
  // `activeSport` and `selectedGroupId` are momentarily out of sync during a
  // sport switch. A group is always 1:1 with exactly one sport — this is the
  // one genuinely correct sportId source for a GROUP_POST/GROUP_BROADCAST,
  // unlike a personal USER_FEED post, which has no equivalent (FEED-3's "Tag
  // sport" stays inert/deferred; that's a different, unscoped gap).
  const selectedGroupSportId = useMemo(
    () => (groupsQuery.data?.content ?? []).find((group) => group.id === selectedGroupId)?.sportId ?? null,
    [groupsQuery.data, selectedGroupId],
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

  const activeBroadcastForSelectedGroup = useMemo(() => {
    if (selectedGroupId === null) return null;
    const posts = activeBroadcastsQuery.data?.content ?? [];
    return posts.find((post) => post.groupId === selectedGroupId) ?? null;
  }, [activeBroadcastsQuery.data, selectedGroupId]);

  const groupFeedQuery = useGroupFeed(selectedGroupId ?? undefined);
  const personalFeedQuery = usePersonalFeed(selectedGroupId === null);
  const activeFeedQuery = selectedGroupId !== null ? groupFeedQuery : personalFeedQuery;

  const posts = useMemo(() => {
    const allPosts = activeFeedQuery.data?.pages.flatMap((page) => page.content) ?? [];
    if (selectedGroupId !== null) return allPosts;
    return allPosts.filter((post) => {
      if (post.postType !== 'GROUP_POST') return false;
      return activeSport === 'all' || post.sportId === sportIdForKey(activeSport);
    });
  }, [activeFeedQuery.data, selectedGroupId, activeSport]);

  const likeMutation = useLikePost();
  const unlikeMutation = useUnlikePost();
  const deleteMutation = useDeletePost();
  const createMutation = useCreatePost();
  const updateMutation = useUpdatePost();

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
  // from `usePost` rather than this hook's own `posts` array — same
  // reasoning as `useHomeFeedData`'s sibling function.
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
    (content: string, options?: { asBroadcast: boolean }) => {
      if (selectedGroupId === null) return;
      // postType must be explicit: the backend defaults an omitted postType
      // to USER_FEED, then rejects it for carrying a groupId at all
      // (PostServiceImpl.createPost) — every group post needs GROUP_POST (or
      // GROUP_BROADCAST, FEED-7) stated outright, not left to infer from
      // groupId alone.
      const postType = options?.asBroadcast ? 'GROUP_BROADCAST' : 'GROUP_POST';
      // sportId: real bug found live — every group post/broadcast was being
      // created with sportId omitted (-> null server-side), even though the
      // group it belongs to has a definite, known sport. That silently broke
      // Feed's own sport-filter for these posts (they'd only ever show under
      // "All"). The group's sportId is the one genuinely correct source here.
      createMutation.mutate({ content, groupId: selectedGroupId, postType, sportId: selectedGroupSportId ?? undefined });
    },
    [createMutation, selectedGroupId, selectedGroupSportId],
  );

  const updateBroadcast = useCallback(
    (content: string, options?: { onSuccess?: () => void }) => {
      if (activeBroadcastForSelectedGroup === null) return;
      // Echo back the existing broadcast's locationName/sportId/visibility —
      // the update endpoint sets these unconditionally from the request body
      // (not a partial patch), so omitting them would null them out. See
      // useUpdatePost's doc comment for the full explanation.
      updateMutation.mutate(
        {
          postId: activeBroadcastForSelectedGroup.id,
          payload: {
            content,
            locationName: activeBroadcastForSelectedGroup.locationName ?? undefined,
            sportId: activeBroadcastForSelectedGroup.sportId ?? undefined,
            visibility: activeBroadcastForSelectedGroup.visibility,
          },
        },
        options,
      );
    },
    [updateMutation, activeBroadcastForSelectedGroup],
  );

  return {
    data: {
      sportProfiles: sportProfilesQuery.data,
      groups,
      posts,
      upcomingMatches: upcomingMatchesQuery.data,
      hashtags: trendingHashtagsQuery.data,
      broadcasts: groupBroadcastsQuery.data,
      groupsById,
    },
    selectedGroupId,
    selectGroup,
    isLoading: activeFeedQuery.isLoading,
    isError: activeFeedQuery.isError,
    toggleLike,
    toggleLikeForPost,
    deletePost,
    createPost,
    isCreatingPost: createMutation.isPending,
    isCreatePostError: createMutation.isError,
    canBroadcast,
    activeBroadcastForSelectedGroup,
    updateBroadcast,
    isUpdatingBroadcast: updateMutation.isPending,
    isBroadcastUpdateError: updateMutation.isError,
    currentUserId,
    hasMorePosts: activeFeedQuery.hasNextPage ?? false,
    isFetchingMorePosts: activeFeedQuery.isFetchingNextPage,
    fetchMorePosts: () => activeFeedQuery.fetchNextPage(),
    isLoadMorePostsError: activeFeedQuery.isFetchNextPageError,
    retryPosts: () => activeFeedQuery.refetch(),
    isHashtagsLoading: trendingHashtagsQuery.isLoading,
    isHashtagsError: trendingHashtagsQuery.isError,
    retryHashtags: trendingHashtagsQuery.refetch,
    isBroadcastsLoading: groupBroadcastsQuery.isLoading,
    isBroadcastsError: groupBroadcastsQuery.isError,
    retryBroadcasts: groupBroadcastsQuery.refetch,
    isGroupsLoading: groupsQuery.isLoading,
    isGroupsError: groupsQuery.isError,
    retryGroups: () => groupsQuery.refetch(),
  };
}
