import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { SportKey } from '@/shared/types/sport';

interface ProfilePageState {
  /**
   * The `/profile` page's own sport pill — independent of every other
   * page's (same 2026-07-25 decision as `homeFeedStore`/`groupsPageStore`):
   * each page saves and handles its active sport on its own, in a separate
   * store. Switching sport here never affects any other page's pill.
   */
  activeSport: SportKey | 'all';
  setActiveSport: (sport: SportKey | 'all') => void;
}

/** Persisted to `sessionStorage` (survives a reload, clears on tab close) —
 * same "restore my current view" scope as `homeFeedStore`/`groupsPageStore`. */
export const useProfilePageStore = create<ProfilePageState>()(
  persist(
    (set) => ({
      activeSport: 'all',
      setActiveSport: (sport) => set({ activeSport: sport }),
    }),
    {
      name: 'profile-page-storage',
      storage: createJSONStorage(() => sessionStorage),
      partialize: (state) => ({ activeSport: state.activeSport }),
    },
  ),
);
