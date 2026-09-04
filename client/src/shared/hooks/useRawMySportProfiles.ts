import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/app/apiClient';
import { useAuthStore } from '@/app/authStore';
import type { ApiResponse } from '@/shared/types/api';
import type { UserSportProfileResponse } from '@/shared/types/sport';

/**
 * SPORT-11: single cache entry for "the caller's own sport profiles" — A22
 * made the read caller-scoped (`GET /api/sports/profiles`, owner resolved
 * from the JWT), so there is no per-user fan-out anymore and the key is a
 * constant. Shared with `useAddSportProfile` / `useUpdateSportProfile` so a
 * mutation's cache write always lands on the entry `useRawMySportProfiles`
 * (and, through it, `useSportProfiles`) reads.
 */
export const sportProfilesQueryKey = ['sportProfiles', 'me'] as const;

/**
 * `GET /api/sports/profiles` — the authenticated caller's own raw
 * `UserSportProfileResponse[]` (`id`, `attributes`, `skillLevel`,
 * `yearsOfExperience`, `preferredPosition`, all present), before the
 * `sportId -> SportKey -> SportProfile` mapping `useSportProfiles` applies.
 *
 * SPORT-11: replaces `useRawSportProfilesForUser(userId)` —
 * `GET /api/sports/profiles/user/{userId}` was removed by backend A22. The
 * only real caller was always "me" (the switcher, the profile Settings tab);
 * the other-user call site (`useFriendsPageData`) moved to
 * `UserInfoResponse.activeSportIds`. `enabled` is still gated on a signed-in
 * user so the query doesn't fire during the refresh-flow bootstrap (an
 * anonymous `GET /api/sports/profiles` 401s); the id itself no longer goes
 * into the URL or the cache key.
 */
export function useRawMySportProfiles() {
  const userId = useAuthStore((state) => state.user?.id);
  return useQuery({
    queryKey: sportProfilesQueryKey,
    queryFn: async () => {
      const response = await apiClient.get<ApiResponse<UserSportProfileResponse[]>>(
        '/sports/profiles',
      );
      return response.data.data;
    },
    enabled: userId !== undefined,
  });
}
