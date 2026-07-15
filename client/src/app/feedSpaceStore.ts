import { create } from 'zustand';
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
  /** Groups are 1:1 with a single sport, so a previously selected group
   * almost never still applies after switching sport — always resets the
   * selection back to "All"/Personal rather than trying to preserve it. */
  setActiveSport: (sport: SportKey | 'all') => void;
  selectGroup: (groupId: number | null) => void;
}

export const useFeedSpaceStore = create<FeedSpaceState>((set) => ({
  activeSport: 'all',
  selectedGroupId: null,
  setActiveSport: (sport) => set({ activeSport: sport, selectedGroupId: null }),
  selectGroup: (groupId) => set({ selectedGroupId: groupId }),
}));
