import { useState } from 'react';
import { useSportCatalog } from '@/shared/hooks/useSportCatalog';

interface UseAddSportLauncherParams {
  /** Sport keys the user already holds a profile for — the catalogue minus these is what's addable. */
  heldSportKeys: string[];
  /** Opens the real picker. Called only once the re-read confirms something is addable. */
  onOpenPicker: () => void;
}

/**
 * SPORT-5 — what happens between clicking "Add sport" and something appearing.
 *
 * Every page's pill did the same thing before: open `AddSportModal` against whatever
 * catalogue was last fetched. Two problems, and this hook owns both so the three pages
 * (Home Feed, Groups, Matches) don't each solve them differently.
 *
 * **Freshness.** The catalogue query is `staleTime: 0` and so refetches on mount and on
 * window focus, but nothing refetched at click time — a long-lived session that never lost
 * focus could not see a sport activated in the meantime. `launch()` re-reads first and
 * decides afterwards.
 *
 * **Never claiming completeness on a failure.** If the re-read fails, `useSportCatalog`'s
 * `refetch` resolves to the cached list rather than an empty one. Only when *that* is also
 * empty do we admit we don't know, via the dialog's unavailable state — "you have every
 * sport" would be a false statement, not a stale one.
 *
 * Deliberately opens nothing until the re-read settles. Opening optimistically on cached
 * data would let the picker appear and then change under the user, which is the bug.
 */
export function useAddSportLauncher({ heldSportKeys, onOpenPicker }: UseAddSportLauncherParams) {
  const sportCatalog = useSportCatalog();
  const [isCheckingCatalog, setIsCheckingCatalog] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isCatalogUnavailable, setIsCatalogUnavailable] = useState(false);

  const check = async () => {
    setIsCheckingCatalog(true);
    try {
      const fresh = await sportCatalog.refetch();
      const addable = fresh.filter((sport) => !heldSportKeys.includes(sport.key));
      if (addable.length > 0) return { open: true as const };
      // Empty because everything is held, or empty because we never got a catalogue at
      // all — only the second is an error, and the two must not share copy.
      return { open: false as const, unavailable: fresh.length === 0 };
    } finally {
      setIsCheckingCatalog(false);
    }
  };

  return {
    isCheckingCatalog,
    isDialogOpen,
    isCatalogUnavailable,
    closeDialog: () => setIsDialogOpen(false),
    /** Wire to the pill's `onAddSport`. */
    launch: async () => {
      const result = await check();
      if (result.open) {
        onOpenPicker();
        return;
      }
      setIsCatalogUnavailable(result.unavailable);
      setIsDialogOpen(true);
    },
    /** Wire to the dialog's Retry, shown only in the unavailable state. */
    retry: async () => {
      const result = await check();
      if (result.open) {
        setIsDialogOpen(false);
        onOpenPicker();
        return;
      }
      setIsCatalogUnavailable(result.unavailable);
    },
  };
}
