import { useEffect } from 'react';
import { useProfilePageStore } from '@/app/profilePageStore';
import { sportKeyForId } from '@/features/feed/sportIdMap';
import type { SportKey } from '@/shared/types/sport';
import { useMySportProfilesRaw } from './useMySportProfilesRaw';

/**
 * Resolves `/profile`'s active sport pill, shared by every tab that needs it
 * (`PostsTab`, `SportProfileSettingsTab`) so the "default to the first sport
 * profile" logic lives in exactly one place. `profilePageStore.activeSport`
 * has no `'all'` state (PROFILE-4 delta) — `null` there means "not yet
 * resolved," and this hook is what turns that into a real `SportKey` once
 * the caller's sport profiles have loaded, persisting the pick back into the
 * store (once) so `SportSwitcher`'s own `active` pill agrees.
 *
 * Returns `undefined` only for a caller with zero sport profiles — callers
 * degrade gracefully for that edge case rather than being gated further
 * here.
 */
export function useProfileActiveSport(): { activeSport: SportKey | undefined; isLoading: boolean } {
  const stored = useProfilePageStore((state) => state.activeSport);
  const setActiveSport = useProfilePageStore((state) => state.setActiveSport);
  const rawProfiles = useMySportProfilesRaw();

  const firstProfileKey =
    rawProfiles.data.length > 0 ? sportKeyForId(rawProfiles.data[0].sportId) : undefined;

  useEffect(() => {
    if (stored === null && firstProfileKey !== undefined) {
      setActiveSport(firstProfileKey);
    }
  }, [stored, firstProfileKey, setActiveSport]);

  return {
    activeSport: stored ?? firstProfileKey,
    isLoading: rawProfiles.isLoading,
  };
}
