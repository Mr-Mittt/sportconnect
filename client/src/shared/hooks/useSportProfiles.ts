import { useAuthStore } from '@/app/authStore';
import { useSportProfilesForUser } from './useSportProfilesForUser';
import type { SportProfile } from '@/shared/types/sport';

/**
 * SPORT-1: real hook against `GET /api/sports/profiles/user/{userId}` for
 * the *current* authenticated user, replacing the mock array that used to
 * live here. Same `{ data, isLoading, isError }` shape as before
 * (client/CLAUDE.md's data layer convention) — HomeFeedPage/GroupsPage/
 * SportSwitcher don't change. Thin wrapper over `useSportProfilesForUser`
 * (extracted during FRIEND-1, which needs the same query for an arbitrary
 * selected user, not just the current one) — the mapping/filtering logic
 * lives there now, not duplicated here.
 */
export function useSportProfiles(): {
  data: SportProfile[];
  isLoading: boolean;
  isError: boolean;
} {
  const userId = useAuthStore((state) => state.user?.id);
  return useSportProfilesForUser(userId);
}
