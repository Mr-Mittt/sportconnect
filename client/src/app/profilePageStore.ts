import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { SportKey } from '@/shared/types/sport';

interface ProfilePageState {
  /**
   * The `/profile` page's own sport pill — independent of every other
   * page's (same 2026-07-25 decision as `homeFeedStore`/`groupsPageStore`):
   * each page saves and handles its active sport on its own, in a separate
   * store. Switching sport here never affects any other page's pill.
   *
   * **No `'all'` state (PROFILE-4 delta, 2026-08-27, user decision).**
   * Unlike Home Feed/Groups, `/profile`'s Settings tab edits exactly one
   * sport profile at a time — there is no sane "all" meaning there, and the
   * user decided the whole page (not just Settings) drops `'all'` for
   * consistency rather than having it work on some tabs and not others.
   * `null` means "not yet resolved" (before sport profiles have loaded),
   * not "all sports" — `useProfileActiveSport()` is what turns `null` into
   * a real `SportKey` by defaulting to the caller's first sport profile.
   */
  activeSport: SportKey | null;
  setActiveSport: (sport: SportKey) => void;
}

/** Persisted to `sessionStorage` (survives a reload, clears on tab close) —
 * same "restore my current view" scope as `homeFeedStore`/`groupsPageStore`. */
export const useProfilePageStore = create<ProfilePageState>()(
  persist(
    (set) => ({
      activeSport: null,
      setActiveSport: (sport) => set({ activeSport: sport }),
    }),
    {
      name: 'profile-page-storage',
      storage: createJSONStorage(() => sessionStorage),
      partialize: (state) => ({ activeSport: state.activeSport }),
    },
  ),
);
