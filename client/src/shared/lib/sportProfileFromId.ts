import { sportIconUrlForId, sportKeyForId } from '@/features/feed/sportIdMap';
import { getSportProfileConfig } from '@/shared/lib/sportProfileConfig';
import type { SportProfile } from '@/shared/types/sport';

/**
 * SPORT-11: the `sportId -> SportKey -> SportProfile` mapping, extracted so
 * the two paths that need it share one copy — `useSportProfiles` (the
 * caller's own `UserSportProfileResponse[]` from `GET /api/sports/profiles`)
 * and `useFriendsPageData` (another user's `UserInfoResponse.activeSportIds`,
 * a bare `number[]` — the only other-user sport data left after A22 removed
 * `GET /api/sports/profiles/user/{userId}`).
 *
 * Returns `undefined` — the caller drops it silently, unchanged from the
 * pre-SPORT-11 behaviour — when the id has no entry in the live sport
 * catalog: the catalog hasn't finished its first fetch, or the sport is
 * deactivated app-wide (A6/A7). `label`/`colorRamp` fall through
 * `getSportProfileConfig`'s generic entry for any catalog sport with no
 * bespoke config; `iconUrl` is the catalog's real backend-served icon, or
 * `null`.
 */
export function sportProfileForId(sportId: number): SportProfile | undefined {
  const key = sportKeyForId(sportId);
  if (key === undefined) {
    return undefined;
  }
  return { key, ...getSportProfileConfig(key), iconUrl: sportIconUrlForId(sportId) };
}
