import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/app/apiClient';
import { feedKeys } from '../queryKeys';
import type { GroupSearchResult, PagedApiResponse } from '../types';

/**
 * Wraps GET /api/groups/public — JoinGroupModal's search/browse source
 * (FEED-5). `keyword`/`sportId` are both optional server-side filters; an
 * empty keyword still returns a browsable list (member groups sort first
 * when authenticated, per the endpoint's own behavior), so this doesn't
 * gate on a non-empty search term — only on `enabled` (default true),
 * which `useJoinGroupModalData` sets to the modal's own `isOpen` so it
 * doesn't keep fetching in the background while visually closed.
 */
export function usePublicGroups(sportId: number | undefined, keyword: string, enabled = true) {
  return useQuery({
    queryKey: feedKeys.publicGroups(sportId, keyword),
    queryFn: async () => {
      const response = await apiClient.get<PagedApiResponse<GroupSearchResult>>('/groups/public', {
        params: {
          ...(sportId !== undefined ? { sportId } : {}),
          ...(keyword !== '' ? { keyword } : {}),
        },
      });
      return response.data.data;
    },
    enabled,
  });
}
