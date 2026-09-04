import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/app/apiClient';
import { useAuthStore } from '@/app/authStore';
import type { ApiResponse } from '@/shared/types/api';
import type { UserSportProfileResponse } from '@/shared/types/sport';

/**
 * SPORT-11: single cache entry for "the caller's own *active* sport profiles"
 * — A22 made the read caller-scoped (`GET /api/sports/profiles`, owner
 * resolved from the JWT), so there is no per-user fan-out anymore and the key
 * is a constant. Shared with `useAddSportProfile` / `useUpdateSportProfile`
 * so a mutation's cache write always lands on the entry `useRawMySportProfiles`
 * (and, through it, `useSportProfiles`) reads.
 */
export const sportProfilesQueryKey = ['sportProfiles', 'me'] as const;

/**
 * SPORT-10: the `?includeInactive=true` sibling — the caller's profiles
 * *including* soft-deleted rows, for the add-sport resume/reactivate flow
 * (`useResumableSports`). A separate cache entry so it never leaks
 * soft-deleted rows into `useSportProfiles` / `useMySportProfilesRaw`, which
 * both read the active-only key above.
 */
export const sportProfilesWithInactiveQueryKey = ['sportProfiles', 'me', 'all'] as const;

interface UseRawMySportProfilesOptions {
  /** SPORT-10: also return soft-deleted (`isActive: false`) rows. Uses a
   * distinct cache key so the two variants never clobber each other. */
  includeInactive?: boolean;
}

/**
 * `GET /api/sports/profiles` — the authenticated caller's own raw
 * `UserSportProfileResponse[]` (`id`, `attributes`, `skillLevel`,
 * `yearsOfExperience`, all present), before the
 * `sportId -> SportKey -> SportProfile` mapping `useSportProfiles` applies.
 *
 * SPORT-11: replaces `useRawSportProfilesForUser(userId)` —
 * `GET /api/sports/profiles/user/{userId}` was removed by backend A22. The
 * only real caller was always "me"; `enabled` is gated on a signed-in user so
 * the query doesn't fire during the refresh-flow bootstrap (an anonymous
 * `GET /api/sports/profiles` 401s).
 *
 * SPORT-10: pass `{ includeInactive: true }` for the resume flow's read —
 * soft-deleted rows are included and the result lands on a distinct key
 * (`sportProfilesWithInactiveQueryKey`), `staleTime` left at the repo default
 * (0) so it reloads on every navigation and window focus.
 */
export function useRawMySportProfiles(options: UseRawMySportProfilesOptions = {}) {
  const { includeInactive = false } = options;
  const userId = useAuthStore((state) => state.user?.id);
  return useQuery({
    queryKey: includeInactive ? sportProfilesWithInactiveQueryKey : sportProfilesQueryKey,
    queryFn: async () => {
      const response = includeInactive
        ? await apiClient.get<ApiResponse<UserSportProfileResponse[]>>('/sports/profiles', {
            params: { includeInactive: true },
          })
        : await apiClient.get<ApiResponse<UserSportProfileResponse[]>>('/sports/profiles');
      return response.data.data;
    },
    enabled: userId !== undefined,
  });
}
