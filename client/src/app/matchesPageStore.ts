import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { SportKey } from '@/shared/types/sport';

interface MatchesPageState {
  /** The Matches page's own sport pill — independent of every other page's
   * (2026-07-25 decision, see groupsPageStore.ts): each page saves and
   * handles its active sport on its own. */
  activeSport: SportKey | 'all';
  setActiveSport: (sport: SportKey | 'all') => void;
}

/** Persisted to sessionStorage — same "restore my current view, clear on tab close" scope as groupsPageStore/homeFeedStore. */
export const useMatchesPageStore = create<MatchesPageState>()(
  persist(
    (set) => ({
      activeSport: 'all',
      setActiveSport: (sport) => set({ activeSport: sport }),
    }),
    {
      name: 'matches-page-storage',
      storage: createJSONStorage(() => sessionStorage),
      partialize: (state) => ({ activeSport: state.activeSport }),
    },
  ),
);
