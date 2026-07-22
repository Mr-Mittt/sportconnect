import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/app/apiClient';
import { friendKeys } from '../queryKeys';
import type { UserSearchResult } from '../types';
import type { PagedApiResponse } from '@/features/feed/types';

/**
 * Wraps `GET /api/users/search?q=` (U6) — the Friends page's "Add friend"
 * directory search. `enabled` is owned by the caller
 * (`useFriendsPageData`), which gates on Add mode + a debounced keyword of
 * at least 2 trimmed characters — the backend 400s below that
 * ("Search keyword must be at least 2 characters"), so this hook is never
 * called with a keyword that would trigger it.
 */
export function useUserSearch(keyword: string, enabled: boolean) {
  return useQuery({
    queryKey: friendKeys.search(keyword),
    queryFn: async () => {
      const response = await apiClient.get<PagedApiResponse<UserSearchResult>>('/users/search', {
        params: { q: keyword },
      });
      return response.data.data;
    },
    enabled,
  });
}
