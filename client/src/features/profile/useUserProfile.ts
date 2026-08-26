import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/app/apiClient';
import { friendKeys } from '@/features/friends/queryKeys';
import type { FriendUser } from '@/features/friends/types';
import type { ApiResponse } from '@/shared/types/api';

/**
 * Wraps `GET /api/users/{userId}` (public) — resolves bio/coverUrl for a
 * selected directory-search result. Friend-list rows already carry this
 * from `useFriends()`'s full `UserResponse`, so `useFriendsPageData` only
 * enables this for a selection that ISN'T already a known friend.
 *
 * Moved here from `features/friends` (2026-08-26, at PROFILE-0 pickup) —
 * it's a generic "look up any user's public profile by id" concern, not
 * friends-specific, and `/profile`'s own hooks need the same endpoint.
 * Still typed and query-keyed for the Friends feature's narrower `FriendUser`
 * shape for now (`friendKeys.profile`, unchanged) — a follow-up ticket
 * (`FRIEND-2` in `client/docs/BACKLOG_MVP.md`, backend `U14` in
 * `modules/user/user-impl/docs/BACKLOG_MVP.md`) will give Friends its own
 * purpose-built endpoint + hook instead of borrowing this one.
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
