import type { DiscoverFilters } from './discoverParams';
import { useDiscoverBaseFilters } from './useDiscoverBaseFilters';
import { useDiscoverTodaySessions } from './hooks/useDiscoverTodaySessions';

/**
 * CLIENT-SESSION-22 delta (2026-09-22) — `SessionDiscoverModal`'s own Discover data boundary:
 * search/location/time (shared with the full page via `useDiscoverBaseFilters`) plus a single,
 * always-today flat session list — no Date pill, no `/discover/counts`, no per-date sections. See
 * `useDiscoverFilters`'s own doc comment for why the modal and the full `/matches` page diverge
 * here now.
 */
export function useDiscoverModalFilters(sportId: number | undefined, enabled: boolean) {
  const base = useDiscoverBaseFilters(sportId, enabled);
  const filters: DiscoverFilters = { sportId, ...base.filters };
  const today = useDiscoverTodaySessions(filters, enabled);

  return {
    ...base,
    sessions: today.sessions,
    isLoading: today.isLoading,
    isError: today.isError,
    hasMore: today.hasMore,
    isFetchingMore: today.isFetchingMore,
    onLoadMore: today.loadMore,
  };
}
