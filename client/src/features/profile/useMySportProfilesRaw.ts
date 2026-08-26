import { useAuthStore } from '@/app/authStore';
import { useRawSportProfilesForUser } from '@/shared/hooks/useSportProfilesForUser';
import type { UserSportProfileResponse } from '@/shared/types/sport';

/**
 * The logged-in user's own raw `UserSportProfileResponse[]` — `id`,
 * `attributes`, `skillLevel`, `yearsOfExperience`, `preferredPosition`, all
 * present. `useSportProfilesForUser` (existing) intentionally maps this down
 * to the display-only `SportProfile` and drops these fields; `/profile`'s
 * Settings tab (PROFILE-4) needs them raw to edit a sport profile.
 */
export function useMySportProfilesRaw(): {
  data: UserSportProfileResponse[];
  isLoading: boolean;
  isError: boolean;
} {
  const userId = useAuthStore((state) => state.user?.id);
  const query = useRawSportProfilesForUser(userId);

  return { data: query.data ?? [], isLoading: query.isLoading, isError: query.isError };
}
