import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

interface FriendsPageState {
  /** The rail's shared search/filter input — also what drives Add mode's
   * directory search once `isAddMode` is true. */
  query: string;
  /** Which of the two rail modes is showing: the friend list/requests view,
   * or Add mode's directory search. */
  isAddMode: boolean;
  /** Who's shown in the profile/chat panel. `undefined` means nothing
   * selected (the "Select a friend…" placeholder). */
  selectedPersonId: string | undefined;
  setQuery: (query: string) => void;
  setIsAddMode: (isAddMode: boolean) => void;
  setSelectedPersonId: (id: string | undefined) => void;
}

/**
 * Persisted to `sessionStorage` (same convention as `groupsPageStore` —
 * survives a reload, clears on tab close, a "restore my current view" scope
 * rather than a permanent cross-session preference) — user-requested:
 * leaving the Friends page (e.g. to Home or Groups) and coming back should
 * restore the rail's mode, search text, and selection exactly as left, with
 * the underlying friend/request/search lists refetched fresh (TanStack
 * Query's own default `staleTime: 0` already does this on every remount —
 * no extra wiring needed here). `useFriendsPageData` is responsible for
 * clearing `selectedPersonId` if, once the reloaded lists have settled,
 * the previously selected person no longer appears in any of them.
 */
export const useFriendsPageStore = create<FriendsPageState>()(
  persist(
    (set) => ({
      query: '',
      isAddMode: false,
      selectedPersonId: undefined,
      setQuery: (query) => set({ query }),
      setIsAddMode: (isAddMode) => set({ isAddMode }),
      setSelectedPersonId: (id) => set({ selectedPersonId: id }),
    }),
    {
      name: 'friends-page-storage',
      storage: createJSONStorage(() => sessionStorage),
      partialize: (state) => ({
        query: state.query,
        isAddMode: state.isAddMode,
        selectedPersonId: state.selectedPersonId,
      }),
    },
  ),
);
