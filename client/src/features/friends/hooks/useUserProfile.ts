import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/app/apiClient';
import { friendKeys } from '../queryKeys';
import type { FriendUser } from '../types';
import type { ApiResponse } from '@/shared/types/api';

/**
 * Wraps `GET /api/users/{userId}` (public) — resolves bio/coverUrl for a
 * selected directory-search result. Friend-list rows already carry this
 * from `useFriends()`'s full `UserResponse`, so `useFriendsPageData` only
 * enables this for a selection that ISN'T already a known friend.
 */
export function useUserProfile(userId: string | undefined) {
  return useQuery({
    queryKey: friendKeys.profile(userId ?? ''),
    queryFn: async () => {
      const response = await apiClient.get<ApiResponse<FriendUser>>(`/users/${userId}`);
      return response.data.data;
    },
    enabled: userId !== undefined,
  });
}
