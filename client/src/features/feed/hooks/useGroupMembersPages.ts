import { useInfiniteQuery } from '@tanstack/react-query';
import { apiClient } from '@/app/apiClient';
import { feedKeys } from '../queryKeys';
import { getNextPageParam } from '../pagination';
import type { GroupMember, PagedApiResponse } from '../types';

/** The page size of the group Share dialog's member list (CLIENT-GROUP-SESSION-3), the first page being what `useGroupMembers` reads. */
export const GROUP_MEMBERS_PAGE_SIZE = 100;

/**
 * Wraps `GET /api/groups/{groupId}/members?page=&size=100` as an infinite query: the group's members 100 at a time, for the Share
 * dialog of a group session, which lists the first page and has a "Load more" for the next ones (`useGroupMembers` reads one page
 * only and has a known cap). Any authenticated caller may read it; `enabled` keeps it off until the dialog is open.
 */
export function useGroupMembersPages(groupId: number | undefined, enabled: boolean) {
  return useInfiniteQuery({
    queryKey: feedKeys.groupMembersPages(groupId ?? -1),
    queryFn: async ({ pageParam }) => {
      const response = await apiClient.get<PagedApiResponse<GroupMember>>(`/groups/${groupId}/members`, {
        params: { page: pageParam, size: GROUP_MEMBERS_PAGE_SIZE },
      });
      return response.data.data;
    },
    initialPageParam: 0,
    getNextPageParam,
    enabled: enabled && groupId !== undefined,
  });
}
