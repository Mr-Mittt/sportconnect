import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { apiClient } from '@/app/apiClient';
import { sportIconUrlForId, sportKeyForId } from '@/features/feed/sportIdMap';
import { getSportProfileConfig } from '@/shared/lib/sportProfileConfig';
import type { ApiResponse } from '@/shared/types/api';
import type { SportProfile, UserSportProfileResponse } from '@/shared/types/sport';

/** Shared with `useAddSportProfile` (current user) and FRIEND-1 (any
 * selected user) so a query key always agrees with whoever fetched it. */
export const sportProfilesQueryKey = (userId: string) => ['sportProfiles', userId] as const;

/**
 * `GET /api/sports/profiles/user/{userId}` for an arbitrary user (public
 * endpoint) — extracted from `useSportProfiles` (SPORT-1, which was
 * hardcoded to the current authenticated user via `authStore`) so FRIEND-1
 * can fetch a selected friend/search-result's sports too, without
 * duplicating the `sportId -> SportKey -> SportProfile` mapping a second
 * time. `useSportProfiles` now delegates here with the current user's id.
 *
 * Same silent-drop behavior as before: a profile whose `sportId` has no
 * `SportKey`/config yet, or that is `isActive: false`, is dropped rather
 * than crashing.
 */
export function useSportProfilesForUser(userId: string | undefined): {
  data: SportProfile[];
  isLoading: boolean;
  isError: boolean;
} {
  const query = useQuery({
    queryKey: sportProfilesQueryKey(userId ?? ''),
    queryFn: async () => {
      const response = await apiClient.get<ApiResponse<UserSportProfileResponse[]>>(
        `/sports/profiles/user/${userId}`,
      );
      return response.data.data;
    },
    enabled: userId !== undefined,
  });

  const data = useMemo<SportProfile[]>(() => {
    return (query.data ?? []).reduce<SportProfile[]>((profiles, profile) => {
      const key = profile.isActive ? sportKeyForId(profile.sportId) : undefined;
      if (key !== undefined) {
        profiles.push({ key, ...getSportProfileConfig(key), iconUrl: sportIconUrlForId(profile.sportId) });
      }
      return profiles;
    }, []);
  }, [query.data]);

  return { data, isLoading: query.isLoading, isError: query.isError };
}
