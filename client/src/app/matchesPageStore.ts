import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { SportKey } from '@/shared/types/sport';

interface MatchesPageState {
  /**
   * The Matches page's own sport pill — independent of every other page's
   * (2026-07-25 decision, see groupsPageStore.ts): each page saves and
   * handles its active sport on its own, in a separate store.
   *
   * **No `'all'` state (CLIENT-SESSION-29 delta, 2026-09-23, user decision) —
   * same reasoning/shape as `profilePageStore`'s own PROFILE-4 delta.**
   * `null` means "not yet resolved" (before sport profiles have loaded), not
   * "all sports" — `useMatchesActiveSport()` is what turns `null` into a
   * real `SportKey` by defaulting to the caller's first sport profile.
   */
  activeSport: SportKey | null;
  setActiveSport: (sport: SportKey) => void;
}

/** Persisted to sessionStorage — same "restore my current view, clear on tab close" scope as groupsPageStore/homeFeedStore. */
export const useMatchesPageStore = create<MatchesPageState>()(
  persist(
    (set) => ({
      activeSport: null,
      setActiveSport: (sport) => set({ activeSport: sport }),
    }),
    {
      name: 'matches-page-storage',
      storage: createJSONStorage(() => sessionStorage),
      partialize: (state) => ({ activeSport: state.activeSport }),
    },
  ),
);
