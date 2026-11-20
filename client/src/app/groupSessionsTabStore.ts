import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import {
  GROUP_SESSION_STATUS_DEFAULTS,
  orderedStatuses,
  type GroupSessionSection,
} from '@/features/session/groupSessionStatuses';
import type { SessionStatus } from '@/shared/types/session';

interface GroupSessionsTabState {
  /** The status filter of each section of a group's Sessions tab. One selection per section, shared by every group (it is the
   * viewer's preference for how to read the tab, not a property of a group). May be empty: the section then asks for nothing. */
  statuses: Record<GroupSessionSection, SessionStatus[]>;
  setStatuses: (section: GroupSessionSection, statuses: readonly SessionStatus[]) => void;
}

const defaults = (): Record<GroupSessionSection, SessionStatus[]> => ({
  today: [...GROUP_SESSION_STATUS_DEFAULTS.today],
  others: [...GROUP_SESSION_STATUS_DEFAULTS.others],
  history: [...GROUP_SESSION_STATUS_DEFAULTS.history],
});

/**
 * CLIENT-GROUP-SESSION-2: the three status filters of the group Sessions tab (owner, 2026-11-20: "stay for the session").
 * Persisted to `sessionStorage` like the Groups page's own store: it survives a reload and leaving the tab, and starts from the
 * defaults again in a new browser session. A selection is kept in the section's own order (`orderedStatuses`), so the query key
 * is the same however the boxes were ticked.
 */
export const useGroupSessionsTabStore = create<GroupSessionsTabState>()(
  persist(
    (set) => ({
      statuses: defaults(),
      setStatuses: (section, statuses) =>
        set((state) => ({ statuses: { ...state.statuses, [section]: orderedStatuses(section, statuses) } })),
    }),
    {
      name: 'group-sessions-tab-storage',
      storage: createJSONStorage(() => sessionStorage),
      partialize: (state) => ({ statuses: state.statuses }),
    },
  ),
);
