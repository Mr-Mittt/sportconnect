import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/app/apiClient';
import { keepWithinSearch } from '@/shared/lib/keepWithinSearch';
import type { ApiResponse } from '@/shared/types/api';
import { feedKeys } from '../queryKeys';
import type { GroupMemberSearchResult } from '../types';

/**
 * How many members a list under a post or comment box shows (the server's default, B23). One more is asked for: the caller is
 * a member too and is never offered to tag themselves, so the list still fills when they match.
 */
export const GROUP_MEMBER_SEARCH_SIZE = 5;

/**
 * Wraps `GET /api/groups/{groupId}/members/search?q=&size=` (B23): the group's members matched on first and last name as
 * the user types (word-start, accent-insensitive), for tagging in a group post and its comments. `query` is the text
 * after the `@`; `null` turns the call off (idle). `search` counts the `@` words the owner has seen end: the previous list
 * stays while the next request of the same `@` word loads and is never carried into the next `@`, so a failed request is
 * an empty list, never the last list (see `keepWithinSearch`). The box keeps working without the list.
 */
export function useGroupMemberSearch(groupId: number | undefined, query: string | null, search = 0) {
  return useQuery({
    queryKey: feedKeys.groupMemberSearch(groupId ?? -1, query),
    queryFn: async () => {
      const response = await apiClient.get<ApiResponse<GroupMemberSearchResult[]>>(
        `/groups/${groupId}/members/search`,
        { params: { q: query ?? '', size: GROUP_MEMBER_SEARCH_SIZE + 1 } },
      );
      return response.data.data;
    },
    enabled: groupId !== undefined && query !== null,
    meta: { search },
    placeholderData: keepWithinSearch<GroupMemberSearchResult[]>(search),
    staleTime: 30_000,
    retry: false,
  });
}
