import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/app/apiClient';
import { feedKeys } from '../queryKeys';
import type { GroupSearchResult, PagedApiResponse } from '../types';

/**
 * Wraps GET /api/groups/public — JoinGroupModal's search/browse source
 * (FEED-5, multi-sport filter added GRP-6/A10). `sportIds` maps to the
 * backend's multi-value `sportIds` param (A10,
 * `modules/social/group-impl/docs/BACKLOG_MVP.md`) — sent as repeated bare
 * keys (`?sportIds=1&sportIds=2`), which requires `apiClient`'s
 * `paramsSerializer: { indexes: null }` (axios's default bracket-notation
 * array serialization is not what Spring's `List<Long> @RequestParam`
 * binds). `enabled` is owned by the caller — `useJoinGroupModalData` sets
 * it to `isOpen && keyword !== ''` (GRP-6: no query while the search input
 * is empty, a deliberate change from FEED-5's original "browse with no
 * query" default).
 */
export function usePublicGroups(sportIds: number[] | undefined, keyword: string, enabled = true) {
  return useQuery({
    queryKey: feedKeys.publicGroups(sportIds, keyword),
    queryFn: async () => {
      const response = await apiClient.get<PagedApiResponse<GroupSearchResult>>('/groups/public', {
        params: {
          ...(sportIds !== undefined && sportIds.length > 0 ? { sportIds } : {}),
          ...(keyword !== '' ? { keyword } : {}),
        },
      });
      return response.data.data;
    },
    enabled,
  });
}
