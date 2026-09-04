import { useRawMySportProfiles } from '@/shared/hooks/useRawMySportProfiles';
import type { UserSportProfileResponse } from '@/shared/types/sport';

/**
 * The logged-in user's own raw `UserSportProfileResponse[]` — `id`,
 * `attributes`, `skillLevel`, `yearsOfExperience`, `preferredPosition`, all
 * present. `useSportProfiles` intentionally maps this down to the
 * display-only `SportProfile` and drops these fields; `/profile`'s Settings
 * tab (PROFILE-4) needs them raw to edit a sport profile.
 *
 * SPORT-11: now a thin normalize (`data` never `undefined`) over the shared
 * `useRawMySportProfiles()` — the `authStore` user-id plumbing went away when
 * A22 made `GET /api/sports/profiles` caller-scoped.
 */
export function useMySportProfilesRaw(): {
  data: UserSportProfileResponse[];
  isLoading: boolean;
  isError: boolean;
} {
  const query = useRawMySportProfiles();

  return { data: query.data ?? [], isLoading: query.isLoading, isError: query.isError };
}
