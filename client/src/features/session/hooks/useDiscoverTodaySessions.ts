import { format } from 'date-fns';
import { useInfiniteQuery } from '@tanstack/react-query';
import { getNextPageParam } from '@/features/feed/pagination';
import { sessionKeys } from '../queryKeys';
import type { DiscoverFilters } from '../discoverParams';
import { fetchDiscoverPage, toDiscoverSessionListItems } from './useDiscoverDateSections';

/**
 * CLIENT-SESSION-22 delta (2026-09-22) — `SessionDiscoverModal`'s own single, always-today
 * `/discover` query: no date picker, no `/discover/counts`, just today's sessions with its own
 * load-more. The rail modal exists to get someone into a session *right now*; real multi-day
 * browsing is what the full `/matches` page (`useDiscoverFilters`) is for — a "Discover more" link
 * on the modal sends anyone who wants more than today there. Reuses `fetchDiscoverPage`/
 * `toDiscoverSessionListItems` from `useDiscoverDateSections.ts` so both surfaces hit `/discover`
 * identically; unlike that file's 8-slot fan-out, this only ever needs one query.
 */
export function useDiscoverTodaySessions(filters: DiscoverFilters, enabled: boolean) {
  const today = format(new Date(), 'yyyy-MM-dd');
  const query = useInfiniteQuery({
    queryKey: sessionKeys.discoverDate(today, filters),
    queryFn: ({ pageParam }) => fetchDiscoverPage(today, filters, pageParam as number),
    initialPageParam: 0,
    getNextPageParam,
    enabled,
  });

  return {
    sessions: toDiscoverSessionListItems(query),
    isLoading: query.isLoading,
    isError: query.isError,
    hasMore: query.hasNextPage ?? false,
    isFetchingMore: query.isFetchingNextPage,
    loadMore: () => query.fetchNextPage(),
  };
}
