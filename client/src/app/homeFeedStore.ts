import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { SportKey } from '@/shared/types/sport';

interface HomeFeedState {
  /**
   * Home Feed's own sport pill — independent of the Groups page's (user
   * decision, 2026-07-25): each page saves and handles its active sport on
   * its own, in separate stores (`groupsPageStore` for the Groups page).
   * Switching sport here never affects what's showing on the Groups page,
   * and vice versa. Reverses FEED-4's original "one shared activeSport"
   * design, which caused a real bug: switching sport on either page could
   * silently affect the other purely because they read/wrote the same
   * field.
   */
  activeSport: SportKey | 'all';
  setActiveSport: (sport: SportKey | 'all') => void;
}

/** Persisted to `sessionStorage` (survives a reload, clears on tab close) —
 * same "restore my current view" scope as `groupsPageStore`, just for Home
 * Feed's own pill instead of sharing one with the Groups page. */
export const useHomeFeedStore = create<HomeFeedState>()(
  persist(
    (set) => ({
      activeSport: 'all',
      setActiveSport: (sport) => set({ activeSport: sport }),
    }),
    {
      name: 'home-feed-storage',
      storage: createJSONStorage(() => sessionStorage),
      partialize: (state) => ({ activeSport: state.activeSport }),
    },
  ),
);
