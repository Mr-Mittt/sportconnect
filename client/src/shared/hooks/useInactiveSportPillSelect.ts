import { useState } from 'react';
import { useInactiveSportNudgeStore } from '@/app/inactiveSportNudgeStore';
import { sportIdForKey } from '@/features/feed/sportIdMap';
import { getSportProfileConfig } from '@/shared/lib/sportProfileConfig';
import type { SportKey } from '@/shared/types/sport';
import { useAddSportProfile } from './useAddSportProfile';

interface UseInactiveSportPillSelectParams {
  /** For the reactivate mutation's cache write — the current user's id. */
  userId: string | undefined;
  /** Make this sport the page's active filter (the page's own `setActiveSport`). Called after
   * `Later` (selection proceeds) and after a successful `Yes` (now a real active sport). */
  onSelectSport: (key: SportKey) => void;
}

/**
 * SPORT-10 §2e: shared wiring for a **deactivated** `SportSwitcher` pill click on a non-`/profile`
 * page (Home Feed, Groups, Matches). First click → the `ReactivateSportNudgeDialog`
 * ("...profile is down. Bring it up?"). `Later` lets the selection through and silences the nudge
 * for that sport for the session (`inactiveSportNudgeStore`); a sport already deferred this
 * session skips straight to selection. `Yes` reactivates (`POST /api/sports/profiles`
 * `{isResume:true}`), then selects it.
 *
 * `/profile` does **not** use this — its deactivated pill opens the Settings-tab Active toggle
 * instead (§2c).
 */
export function useInactiveSportPillSelect({ userId, onSelectSport }: UseInactiveSportPillSelectParams) {
  const addSport = useAddSportProfile(userId);
  const isSportDeferred = useInactiveSportNudgeStore((state) => state.isSportDeferred);
  const deferSport = useInactiveSportNudgeStore((state) => state.deferSport);
  const [pendingKey, setPendingKey] = useState<SportKey | undefined>(undefined);

  const onInactiveSelect = (key: SportKey) => {
    if (isSportDeferred(key)) {
      onSelectSport(key);
      return;
    }
    addSport.reset();
    setPendingKey(key);
  };

  const close = () => {
    setPendingKey(undefined);
    addSport.reset();
  };

  return {
    onInactiveSelect,
    /** `null` when no nudge is open; otherwise spread straight onto `ReactivateSportNudgeDialog`. */
    nudge:
      pendingKey === undefined
        ? null
        : {
            isOpen: true,
            mode: 'sport-pill' as const,
            sportName: getSportProfileConfig(pendingKey).label,
            isReactivating: addSport.isPending,
            isError: addSport.isError,
            onLater: () => {
              deferSport(pendingKey);
              onSelectSport(pendingKey);
              close();
            },
            onReactivate: () => {
              addSport.mutate(
                { sportId: sportIdForKey(pendingKey) ?? 0, isResume: true },
                {
                  onSuccess: () => {
                    onSelectSport(pendingKey);
                    setPendingKey(undefined);
                  },
                },
              );
            },
          },
  };
}
