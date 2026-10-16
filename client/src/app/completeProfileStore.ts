import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

interface CompleteProfileState {
  /** The id of the user who skipped the "complete your profile" dialog in this tab, or null. Keyed by
   * user so a second account signing in on the same tab is still asked. */
  skippedFor: string | null;
  skip: (userId: string) => void;
}

/**
 * AUTH-16: remembers that the user pressed "Skip for now" on the "complete your profile" dialog.
 * Persisted to `sessionStorage` (survives a reload, clears when the tab closes), so a skipped
 * dialog stays away for the rest of the session and comes back on the next sign-in while the
 * profile is still incomplete — the owner's rule: skippable, with a reminder. Never `localStorage`:
 * nothing about it should outlive the session.
 */
export const useCompleteProfileStore = create<CompleteProfileState>()(
  persist(
    (set) => ({
      skippedFor: null,
      skip: (userId) => set({ skippedFor: userId }),
    }),
    {
      name: 'complete-profile-storage',
      storage: createJSONStorage(() => sessionStorage),
      partialize: (state) => ({ skippedFor: state.skippedFor }),
    },
  ),
);
