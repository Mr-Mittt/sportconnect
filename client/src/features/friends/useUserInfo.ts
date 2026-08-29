import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/app/apiClient';
import { friendKeys } from './queryKeys';
import type { UserInfo } from './types';
import type { ApiResponse } from '@/shared/types/api';

/**
 * Wraps `GET /api/users/{userId}` (U11 — returns the PII-free
 * `UserInfoResponse` for any authenticated caller looking up someone who
 * isn't themselves). Auth is a non-issue here: every Friends route already
 * sits behind `ProtectedRoute`.
 *
 * Resolves bio/coverUrl/username for a directory-search result the user
 * selected. Friend-list rows already carry bio/coverUrl from `useFriends()`,
 * so `useFriendsPageData` only enables this for a selection that ISN'T
 * already a known friend.
 *
 * Owned by the Friends feature (FRIEND-2, 2026-08-29) — replaces the
 * `features/profile/useUserProfile` hook it used to borrow, which was typed
 * to Friends' own shape but lived in another feature's folder off an
 * endpoint shaped for a different use case.
 */
export function useUserInfo(userId: string | undefined) {
  return useQuery({
    queryKey: friendKeys.profile(userId ?? ''),
    queryFn: async () => {
      const response = await apiClient.get<ApiResponse<UserInfo>>(`/users/${userId}`);
      return response.data.data;
    },
    enabled: userId !== undefined,
  });
}
