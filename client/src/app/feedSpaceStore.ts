import { create } from 'zustand';
import { SPORT_ID_BY_KEY } from '@/features/feed/sportIdMap';
import type { SportKey } from '@/shared/types/sport';

interface FeedSpaceState {
  /** Shared across Home Feed and the Groups page (FEED-4) — promoted out of
   * HomeFeedPage's former local state per client/CLAUDE.md's cross-page state
   * rule, now that a second page needs it. */
  activeSport: SportKey | 'all';
  /** Which group's feed is selected on the Groups page. null means "All" on
   * that page (or is simply unused on Home Feed, which never shows a group
   * feed). A UI selection, not fetched data — stays out of TanStack Query
   * per FEED-4's spec. */
  selectedGroupId: number | null;
  /** The selected group's own sportId, tracked alongside its id so a sport
   * switch can tell whether that selection is still valid (see
   * `setActiveSport`) — null whenever `selectedGroupId` is null. */
  selectedGroupSportId: number | null;
  /** Groups are 1:1 with a single sport, so a previously selected group
   * only stays selected across a sport switch if it's still valid under the
   * new filter: "All" is always compatible, and a specific sport is
   * compatible only if it matches the group's own sport
   * (`selectedGroupSportId`) — otherwise the selection genuinely no longer
   * applies and resets back to "All". (Bug found live: switching sport away
   * from "All" to the *same* sport the selected group already belongs to
   * used to unconditionally reset the selection anyway — there was nothing
   * actually incompatible about it.) */
  setActiveSport: (sport: SportKey | 'all') => void;
  selectGroup: (groupId: number | null, groupSportId?: number | null) => void;
}

export const useFeedSpaceStore = create<FeedSpaceState>((set) => ({
  activeSport: 'all',
  selectedGroupId: null,
  selectedGroupSportId: null,
  setActiveSport: (sport) =>
    set((state) => {
      const stillValid =
        state.selectedGroupId === null ||
        sport === 'all' ||
        SPORT_ID_BY_KEY[sport] === state.selectedGroupSportId;
      return {
        activeSport: sport,
        selectedGroupId: stillValid ? state.selectedGroupId : null,
        selectedGroupSportId: stillValid ? state.selectedGroupSportId : null,
      };
    }),
  selectGroup: (groupId, groupSportId = null) =>
    set({ selectedGroupId: groupId, selectedGroupSportId: groupId === null ? null : groupSportId }),
}));
