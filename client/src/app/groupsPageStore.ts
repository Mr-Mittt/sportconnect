import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { sportKeyForId } from '@/features/feed/sportIdMap';
import type { SportKey } from '@/shared/types/sport';

interface GroupsPageState {
  /**
   * The Groups page's own sport pill — independent of Home Feed's (user
   * decision, 2026-07-25): each page saves and handles its active sport on
   * its own, in separate stores (`homeFeedStore` for Home Feed). Switching
   * sport on one page never affects the other. This reverses FEED-4's
   * original "one shared activeSport" design, which caused a real bug: Home
   * Feed's own sport switching could silently change what group was showing
   * on the Groups page (or vice versa) purely because they read/wrote the
   * same field.
   */
  activeSport: SportKey | 'all';
  /** Which group's feed is selected on the Groups page. null means "All"
   * (the discovery/list view). A UI selection, not fetched data — stays out
   * of TanStack Query per FEED-4's spec. */
  selectedGroupId: number | null;
  /** The selected group's own sportId, tracked alongside its id — null
   * whenever `selectedGroupId` is null. */
  selectedGroupSportId: number | null;
  /** Just sets this page's own `activeSport`. `GroupsPage.tsx` additionally
   * decides, on its own, whether a sport switch should also deselect the
   * currently open group (`guardedSetActiveSport`) — that decision lives in
   * the page, not here. */
  setActiveSport: (sport: SportKey | 'all') => void;
  /**
   * Opening a specific group also drives this page's own sport pill to
   * match — a group is 1:1 with a sport, so this is an unambiguous
   * derivation done once here rather than at every call site. Selecting
   * "All" (`groupId === null`) leaves `activeSport` untouched.
   * `groupSportId` outside the 3 known SportKeys (no `sportKeyForId` match)
   * also leaves `activeSport` untouched — same "unknown sport, don't crash"
   * precedent used elsewhere in this codebase.
   */
  selectGroup: (groupId: number | null, groupSportId?: number | null) => void;
}

/**
 * Persisted to `sessionStorage` — `/groups` has no `:groupId` in the URL
 * (unlike `/posts/:postId`, FEED-12's deep-link route), so without this a
 * reload lost `selectedGroupId` entirely: the store reset to its defaults,
 * `GroupsPage` fell back to `GroupDiscoveryPanel`'s "All groups" state even
 * though the user was looking at a specific group's tab. `sessionStorage`
 * (not `localStorage`) — survives a reload but clears on tab close, matching
 * a "restore my current view" scope rather than a permanent cross-session
 * preference. All three state fields persist together (not just
 * `selectedGroupId`) so a restored session doesn't land with a mismatched
 * sport tab vs. selected group.
 *
 * Home Feed reaches into this store's `selectGroup` directly (not
 * `activeSport`) when navigating here from a group post's "> groupname"
 * link — that's a deliberate one-off write into the Groups page's own
 * state ("open this group when you land there"), not a sign the two pages
 * share `activeSport` again.
 */
export const useGroupsPageStore = create<GroupsPageState>()(
  persist(
    (set) => ({
      activeSport: 'all',
      selectedGroupId: null,
      selectedGroupSportId: null,
      setActiveSport: (sport) => set({ activeSport: sport }),
      selectGroup: (groupId, groupSportId = null) =>
        set((state) => {
          const sportKey = groupId !== null ? sportKeyForId(groupSportId ?? null) : undefined;
          return {
            selectedGroupId: groupId,
            selectedGroupSportId: groupId === null ? null : groupSportId,
            activeSport: sportKey ?? state.activeSport,
          };
        }),
    }),
    {
      name: 'groups-page-storage',
      storage: createJSONStorage(() => sessionStorage),
      partialize: (state) => ({
        activeSport: state.activeSport,
        selectedGroupId: state.selectedGroupId,
        selectedGroupSportId: state.selectedGroupSportId,
      }),
    },
  ),
);
