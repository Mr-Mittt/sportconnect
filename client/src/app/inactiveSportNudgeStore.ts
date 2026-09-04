import { create } from 'zustand';
import type { SportKey } from '@/shared/types/sport';

interface InactiveSportNudgeState {
  /** Sports for which the user picked "Later" on the reactivate nudge — the nudge is suppressed
   * for the rest of the session (this is not persisted, so a reload brings it back). */
  deferredSportKeys: SportKey[];
  /** Groups (linked to a deactivated sport) for which the user picked "Later" — suppressed once
   * per group per session. */
  deferredGroupIds: number[];
  deferSport: (key: SportKey) => void;
  deferGroup: (groupId: number) => void;
  isSportDeferred: (key: SportKey) => boolean;
  isGroupDeferred: (groupId: number) => boolean;
}

/**
 * SPORT-10 §2e: session-only memory of "Later" choices on the reactivate-a-deactivated-sport
 * nudge. Deliberately **not** persisted — "later" means "not right now", so it resets on reload
 * (same reasoning as `homeFeedStore` persisting the *view* but nothing transient). App-wide, not
 * per-page: deferring Badminton's nudge on Home Feed also silences it on Matches this session.
 */
export const useInactiveSportNudgeStore = create<InactiveSportNudgeState>()((set, get) => ({
  deferredSportKeys: [],
  deferredGroupIds: [],
  deferSport: (key) =>
    set((state) =>
      state.deferredSportKeys.includes(key)
        ? state
        : { deferredSportKeys: [...state.deferredSportKeys, key] },
    ),
  deferGroup: (groupId) =>
    set((state) =>
      state.deferredGroupIds.includes(groupId)
        ? state
        : { deferredGroupIds: [...state.deferredGroupIds, groupId] },
    ),
  isSportDeferred: (key) => get().deferredSportKeys.includes(key),
  isGroupDeferred: (groupId) => get().deferredGroupIds.includes(groupId),
}));
