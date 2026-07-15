import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { apiClient } from '@/app/apiClient';
import { useAuthStore } from '@/app/authStore';
import { sportKeyForId } from '@/features/feed/sportIdMap';
import { SPORT_PROFILE_CONFIG } from '@/shared/lib/sportProfileConfig';
import type { ApiResponse } from '@/shared/types/api';
import type { SportProfile, UserSportProfileResponse } from '@/shared/types/sport';

/** Shared with `useAddSportProfile` so a newly-added profile's cache write
 * targets exactly the query this hook reads — one source of truth for the
 * key instead of two files agreeing on a literal by convention. */
export const sportProfilesQueryKey = (userId: string) => ['sportProfiles', userId] as const;

/**
 * SPORT-1: real hook against `GET /api/sports/profiles/user/{userId}`,
 * replacing the mock array that used to live here. Same `{ data, isLoading,
 * isError }` shape as before (client/CLAUDE.md's data layer convention) —
 * HomeFeedPage/GroupsPage/SportSwitcher don't change.
 *
 * Mapping: `sportId` -> `SportKey` reuses `sportKeyForId` (the same
 * temporary bridge FEED-1/FEED-4 already use for posts/groups), rather than
 * inventing a second id<->key table — this is also what keeps the
 * acceptance criteria's "sport keys stay consistent with what the posts API
 * returns" true. Any profile whose sportId falls outside that map (a real
 * sport the client has no SportKey/config for yet, e.g. Badminton) or that
 * is `isActive: false` is silently dropped rather than crashing — label/
 * icon/colorRamp then come from the static `SPORT_PROFILE_CONFIG`, not the
 * backend's `sportName`/`iconUrl`.
 */
export function useSportProfiles(): {
  data: SportProfile[];
  isLoading: boolean;
  isError: boolean;
} {
  const userId = useAuthStore((state) => state.user?.id);

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
        profiles.push({ key, ...SPORT_PROFILE_CONFIG[key] });
      }
      return profiles;
    }, []);
  }, [query.data]);

  return { data, isLoading: query.isLoading, isError: query.isError };
}
