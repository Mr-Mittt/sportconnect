import { useMemo } from 'react';
import { sportProfileForId } from '@/shared/lib/sportProfileFromId';
import type { SportProfile } from '@/shared/types/sport';
import { useRawMySportProfiles } from './useRawMySportProfiles';

/**
 * The current authenticated user's sports, mapped to the display-only
 * `SportProfile` — `HomeFeedPage` / `GroupsPage` / `SportSwitcher` / etc.
 * consume this. Same `{ data, isLoading, isError }` shape as always
 * (client/CLAUDE.md's data-layer convention).
 *
 * SPORT-11: reads `useRawMySportProfiles()` (caller-scoped
 * `GET /api/sports/profiles`, A22) and shares the `sportId -> SportProfile`
 * mapping with `useFriendsPageData` via `sportProfileForId`. Same silent-drop
 * behaviour as before: a profile that is `isActive: false`, or whose
 * `sportId` the live catalog doesn't resolve, is left out rather than
 * crashing.
 */
export function useSportProfiles(): {
  data: SportProfile[];
  isLoading: boolean;
  isError: boolean;
} {
  const query = useRawMySportProfiles();

  const data = useMemo<SportProfile[]>(() => {
    return (query.data ?? []).reduce<SportProfile[]>((profiles, profile) => {
      if (profile.isActive) {
        const mapped = sportProfileForId(profile.sportId);
        if (mapped !== undefined) {
          profiles.push(mapped);
        }
      }
      return profiles;
    }, []);
  }, [query.data]);

  return { data, isLoading: query.isLoading, isError: query.isError };
}
