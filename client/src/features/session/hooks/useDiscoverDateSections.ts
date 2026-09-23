import {
  useInfiniteQuery,
  type InfiniteData,
  type UseInfiniteQueryResult,
} from '@tanstack/react-query';
import { apiClient } from '@/app/apiClient';
import { getNextPageParam } from '@/features/feed/pagination';
import type { PagedApiResponse, PageResponse } from '@/features/feed/types';
import type { Session } from '@/shared/types/session';
import { sessionKeys } from '../queryKeys';
import { buildDiscoverParams, type DiscoverFilters } from '../discoverParams';
import { MAX_DISCOVER_DATES } from '../discoverDateLabel';
import type { DiscoverDateSection, SessionListItem } from '../types';

export const DISCOVER_PAGE_SIZE = 10; // SESSION-37's default — /discover never overrides it from the client.

export type DiscoverSectionQuery = UseInfiniteQueryResult<InfiniteData<PageResponse<Session>>>;

/** Shared by every `/discover` infinite query — this module's own per-date sections, and
 * `useDiscoverTodaySessions`' single flat query for `SessionDiscoverModal` (CLIENT-SESSION-22
 * delta, 2026-09-22). */
export async function fetchDiscoverPage(
  date: string,
  filters: DiscoverFilters,
  pageParam: number,
): Promise<PageResponse<Session>> {
  const response = await apiClient.get<PagedApiResponse<Session>>('/sessions/discover', {
    params: { ...buildDiscoverParams(filters), date, page: pageParam, size: DISCOVER_PAGE_SIZE },
  });
  return response.data.data;
}

/** One Date-filter section's own `/discover` infinite query — `date` may be `undefined` for an
 * unused slot (fewer than `MAX_DISCOVER_DATES` dates checked), in which case this stays disabled
 * and never fetches. Factored out so `useDiscoverDateSections` below can call it a fixed, literal
 * number of times instead of from inside a loop (see that function's doc comment for why). */
function useDiscoverSectionQuery(
  date: string | undefined,
  isExpanded: boolean,
  filters: DiscoverFilters,
  baseEnabled: boolean,
): DiscoverSectionQuery {
  return useInfiniteQuery({
    queryKey: sessionKeys.discoverDate(date ?? '', filters),
    queryFn: ({ pageParam }) => fetchDiscoverPage(date ?? '', filters, pageParam as number),
    initialPageParam: 0,
    getNextPageParam,
    enabled: baseEnabled && date !== undefined && isExpanded,
  });
}

/**
 * CLIENT-SESSION-22 — one `useInfiniteQuery` per Date-filter section, own load-more (absorbs
 * CLIENT-SESSION-26's scope). Calls `useDiscoverSectionQuery` a **fixed 8 times, unconditionally
 * and unrolled** — one literal call per slot, not a loop — since `MAX_DISCOVER_DATES` (8, shared
 * with `/discover/counts`' own hard cap) is the most dates this feature will ever have to query at
 * once. This keeps every call a plain top-level Rules-of-Hooks-compliant call (no
 * `eslint-disable`, no calling a hook from inside `.map()`), at the cost of the literal repetition
 * below. The installed TanStack Query (5.101) has no `useInfiniteQueries` (only a same-named
 * `useQueries` for plain, non-infinite queries — the precedent `useGroupSessionsForGroups` uses
 * for its own variable-length array of sessions) to reach for instead. A collapsed date's slot
 * stays disabled — its own `/discover` call fires only the first time it's expanded (the counts
 * already came from `useDiscoverDateCounts`, cheaply, for every date whether expanded or not).
 */
export function useDiscoverDateSections(
  dates: string[],
  expandedDates: ReadonlySet<string>,
  filters: DiscoverFilters,
  baseEnabled: boolean,
): Map<string, DiscoverSectionQuery> {
  const isExpanded = (date: string | undefined) => date !== undefined && expandedDates.has(date);

  const q0 = useDiscoverSectionQuery(dates[0], isExpanded(dates[0]), filters, baseEnabled);
  const q1 = useDiscoverSectionQuery(dates[1], isExpanded(dates[1]), filters, baseEnabled);
  const q2 = useDiscoverSectionQuery(dates[2], isExpanded(dates[2]), filters, baseEnabled);
  const q3 = useDiscoverSectionQuery(dates[3], isExpanded(dates[3]), filters, baseEnabled);
  const q4 = useDiscoverSectionQuery(dates[4], isExpanded(dates[4]), filters, baseEnabled);
  const q5 = useDiscoverSectionQuery(dates[5], isExpanded(dates[5]), filters, baseEnabled);
  const q6 = useDiscoverSectionQuery(dates[6], isExpanded(dates[6]), filters, baseEnabled);
  const q7 = useDiscoverSectionQuery(dates[7], isExpanded(dates[7]), filters, baseEnabled);
  const queries = [q0, q1, q2, q3, q4, q5, q6, q7];

  if (dates.length > MAX_DISCOVER_DATES) {
    // The Date filter's own 8-cap (discoverDateLabel.ts) should make this unreachable — a loud
    // failure here beats an 9th+ date silently never being queried.
    throw new Error(`useDiscoverDateSections: got ${dates.length} dates, max is ${MAX_DISCOVER_DATES}`);
  }

  const byDate = new Map<string, DiscoverSectionQuery>();
  dates.forEach((date, i) => byDate.set(date, queries[i]));
  return byDate;
}

/** Flattens one section's infinite-query pages into the `SessionListItem[]` its `DiscoverDateSection`
 * renders — `groupName: null` always (Discover is standalone-only, same mapping `discoverSearch.ts`
 * used to do before CLIENT-SESSION-22 moved filtering server-side). */
export function toDiscoverSessionListItems(query: DiscoverSectionQuery | undefined): SessionListItem[] {
  const pages = query?.data?.pages ?? [];
  return pages.flatMap((page) => page.content.map((session) => ({ ...session, groupName: null })));
}

/** Assembles the full `DiscoverDateSection[]` the panel renders — one entry per checked date, in
 * checked order (the caller decides display order; today this feature always passes them sorted
 * chronologically ascending). `counts` is a lookup by date (0 when a checked date isn't in the
 * counts response yet, e.g. its own query is still loading). */
export function buildDiscoverDateSections(
  dates: string[],
  labels: Map<string, string>,
  counts: Map<string, number>,
  expandedDates: ReadonlySet<string>,
  sectionQueries: Map<string, DiscoverSectionQuery>,
): DiscoverDateSection[] {
  return dates.map((date) => {
    const query = sectionQueries.get(date);
    return {
      date,
      label: labels.get(date) ?? date,
      count: counts.get(date) ?? 0,
      isExpanded: expandedDates.has(date),
      sessions: toDiscoverSessionListItems(query),
      isLoading: query?.isLoading ?? false,
      isError: query?.isError ?? false,
      hasMore: query?.hasNextPage ?? false,
      isFetchingMore: query?.isFetchingNextPage ?? false,
    };
  });
}
