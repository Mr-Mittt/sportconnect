import { useSportCatalogStore } from '@/shared/lib/sportCatalogStore';
import type { SportKey } from '@/shared/types/sport';

/**
 * SPORT-3: id<->key lookups now resolve against the live sport catalog
 * (`sportCatalogStore`, populated once by `AppShell`'s `useSportCatalog()`
 * call) instead of a hardcoded `{ football: 5, basketball: 6, tennis: 2 }`
 * table. Both functions read `useSportCatalogStore.getState()` directly
 * (not the reactive hook form) so they stay callable from plain,
 * non-component code — `groupsPageStore.ts`'s `selectGroup` action resolves
 * a group's sport synchronously inside a `set()` callback, which can't call
 * a React hook.
 *
 * Both can now return `undefined` for a real, reachable reason beyond "id
 * doesn't exist at all" — the catalog hasn't finished its first fetch yet,
 * or the id belongs to a sport the live catalog doesn't currently return
 * (e.g. deactivated server-side, A6). Every call site already treats
 * `undefined` as "unknown sport, don't crash" — the same precedent the old
 * hardcoded table established for any id outside its 3 known entries.
 */
export function sportIdForKey(key: SportKey): number | undefined {
  return useSportCatalogStore.getState().byKey.get(key)?.id;
}

export function sportKeyForId(sportId: number | null): SportKey | undefined {
  if (sportId === null) {
    return undefined;
  }
  return useSportCatalogStore.getState().byId.get(sportId)?.key;
}

/** SPORT-4: same catalog lookup as `sportKeyForId`, for the sport's real
 * icon instead of its key — null (not just undefined) when the id doesn't
 * resolve, matching `SportProfile.iconUrl`'s "no icon" shape directly. */
export function sportIconUrlForId(sportId: number | null): string | null {
  if (sportId === null) {
    return null;
  }
  return useSportCatalogStore.getState().byId.get(sportId)?.iconUrl ?? null;
}
