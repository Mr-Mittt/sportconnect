import { create } from 'zustand';
import type { SportCatalogEntry, SportKey } from '@/shared/types/sport';

interface SportCatalogState {
  sports: SportCatalogEntry[];
  byId: Map<number, SportCatalogEntry>;
  byKey: Map<SportKey, SportCatalogEntry>;
  setCatalog: (sports: SportCatalogEntry[]) => void;
}

/**
 * SPORT-3: plain (non-persisted) Zustand store mirroring `useSportCatalog()`'s
 * fetched data — exists so sport id<->key lookups (`sportIdMap.ts`) stay
 * usable from places that can't call a React hook, specifically
 * `groupsPageStore.ts`'s `selectGroup` action, which resolves a group's sport
 * synchronously inside a `set()` callback. `AppShell` is the one place that
 * calls `useSportCatalog()` and writes its result in here via `setCatalog`;
 * everything else only reads.
 *
 * Empty (`sports: []`) until the catalog fetch resolves — every lookup
 * against it degrades to "not found" during that brief window, the same
 * "unknown sport, don't crash" semantics already established elsewhere in
 * this codebase for an unresolvable sportId.
 */
export const useSportCatalogStore = create<SportCatalogState>()((set, get) => ({
  sports: [],
  byId: new Map(),
  byKey: new Map(),
  // Reference-equality no-op guard: `useSportCatalog()`'s `data` array is memoized (stable
  // reference unless the underlying query result actually changed), so this makes it safe for
  // AppShell to call setCatalog unconditionally on every render — see AppShell's own comment for
  // why that matters.
  setCatalog: (sports) => {
    if (get().sports === sports) return;
    set({
      sports,
      byId: new Map(sports.map((sport) => [sport.id, sport])),
      byKey: new Map(sports.map((sport) => [sport.key, sport])),
    });
  },
}));
