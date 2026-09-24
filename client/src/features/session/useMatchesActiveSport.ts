import { useEffect } from 'react';
import { useMatchesPageStore } from '@/app/matchesPageStore';
import { useSportProfiles } from '@/shared/hooks/useSportProfiles';
import type { SportKey } from '@/shared/types/sport';

/**
 * Resolves `/matches`'s active sport pill — same "no `'all'` state, default to the first sport
 * profile" shape `useProfileActiveSport` already established for `/profile` (PROFILE-4), applied
 * here per direct user decision (CLIENT-SESSION-29, 2026-09-23): `/matches` no longer offers an
 * "All sports" pill. `matchesPageStore.activeSport` `null` means "not yet resolved" — this hook
 * turns that into a real `SportKey` once the caller's sport profiles have loaded, persisting the
 * pick back into the store (once) so `SportSwitcher`'s own `active` pill agrees.
 *
 * Returns `undefined` only for a caller with zero sport profiles — `MatchesPage`'s own
 * zero-sport-profile gate handles that edge case, not this hook.
 */
export function useMatchesActiveSport(): { activeSport: SportKey | undefined; isLoading: boolean } {
  const stored = useMatchesPageStore((state) => state.activeSport);
  const setActiveSport = useMatchesPageStore((state) => state.setActiveSport);
  const sportProfilesQuery = useSportProfiles();

  const firstProfileKey = sportProfilesQuery.data[0]?.key;

  useEffect(() => {
    if (stored === null && firstProfileKey !== undefined) {
      setActiveSport(firstProfileKey);
    }
  }, [stored, firstProfileKey, setActiveSport]);

  return {
    activeSport: stored ?? firstProfileKey,
    isLoading: sportProfilesQuery.isLoading,
  };
}
