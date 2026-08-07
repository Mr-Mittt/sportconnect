import { useMemo } from 'react';
import { useAuthStore } from '@/app/authStore';
import { useActiveBroadcasts } from '@/features/feed/hooks/useActiveBroadcasts';
import { useUserGroups } from '@/features/feed/hooks/useUserGroups';
import { sportKeyForId } from '@/features/feed/sportIdMap';
import { getSportProfileConfig } from '@/shared/lib/sportProfileConfig';
import type { GroupBroadcast } from '@/shared/types/rail';

function initialsFor(groupName: string): string {
  return groupName
    .split(' ')
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

/**
 * FEED-7: real hook against `GET /api/posts/broadcast`
 * (`features/feed/hooks/useActiveBroadcasts`, FEED-0), replacing the mock
 * array that used to live here. Same `{ data, isLoading, isError }` shape as
 * before — `GroupBroadcasts`, `HomeFeedPage`, and `GroupsPage` don't change.
 *
 * A broadcast `Post` only carries `groupId`, not the group's name/sport, so
 * this also reads `useUserGroups` (already mounted elsewhere with the same
 * query key — TanStack Query dedups, no extra network call) to resolve
 * `groupName`/`groupInitials`/`colorRamp` (via the group's `sportId`, same
 * "group's own sport ramp" convention `GroupSpaceSwitcher` already uses — a
 * group has no color of its own). A broadcast whose `groupId` doesn't match
 * any of the caller's groups (shouldn't happen — the endpoint is scoped to
 * the caller's own groups) is dropped rather than crashing, same defensive
 * convention SPORT-1 used for unknown sportIds.
 *
 * FEED-8 adds `refetch` — the retry action behind `GroupBroadcasts`' error
 * state. Refetches both underlying queries, since either one failing sets
 * `isError` above.
 */
export function useGroupBroadcasts(): {
  data: GroupBroadcast[];
  isLoading: boolean;
  isError: boolean;
  refetch: () => Promise<unknown>;
} {
  const userId = useAuthStore((state) => state.user?.id);
  const broadcastsQuery = useActiveBroadcasts();
  const groupsQuery = useUserGroups(userId);

  const data = useMemo<GroupBroadcast[]>(() => {
    const groups = groupsQuery.data?.content ?? [];
    const posts = broadcastsQuery.data?.content ?? [];

    return posts.reduce<GroupBroadcast[]>((broadcasts, post) => {
      const group = groups.find((candidate) => candidate.id === post.groupId);
      if (group === undefined) return broadcasts;

      const sportKey = sportKeyForId(group.sportId);
      const colorRamp = sportKey !== undefined ? getSportProfileConfig(sportKey).colorRamp : '';

      broadcasts.push({
        id: post.id,
        groupId: group.id,
        groupName: group.groupName,
        groupInitials: initialsFor(group.groupName),
        colorRamp,
        text: post.content,
        createdAt: post.createdAt,
      });
      return broadcasts;
    }, []);
  }, [broadcastsQuery.data, groupsQuery.data]);

  return {
    data,
    isLoading: broadcastsQuery.isLoading || groupsQuery.isLoading,
    isError: broadcastsQuery.isError || groupsQuery.isError,
    refetch: () => Promise.all([broadcastsQuery.refetch(), groupsQuery.refetch()]),
  };
}
