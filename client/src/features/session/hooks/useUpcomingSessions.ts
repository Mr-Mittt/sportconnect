import { useInfiniteQuery } from '@tanstack/react-query';
import { apiClient } from '@/app/apiClient';
import { getNextPageParam } from '@/features/feed/pagination';
import type { PagedApiResponse } from '@/features/feed/types';
import type { Session } from '@/shared/types/session';
import { sessionKeys } from '../queryKeys';

/** Backend SESSION-27's own `@PageableDefault(size = 20)` — sent explicitly so a server-side
 * default change can't silently change what "one page" means here (the rail relies on one page
 * being at least `UpcomingMatches`' `maxVisible`). */
export const UPCOMING_PAGE_SIZE = 20;

/**
 * CLIENT-SESSION-23 — `GET /sessions/upcoming` (backend SESSION-27/43): every session, standalone
 * or group-linked, where the caller currently has a `JOINED` or `INVITED` participant row and the
 * status is `PREPARING`/`SCHEDULED`/`ONGOING` — `PREPARING` included, which is what closes the
 * old rail's "PREPARING never showed up" bug (its client-side `SCHEDULED`/`ONGOING` filter is gone
 * with the fan-out it filtered). Server-sorted soonest-first, so callers never re-sort.
 *
 * `sportId: undefined` means all sports (the `UpcomingMatches` rail); the Matches page's
 * "Upcoming sessions" section always passes its active sport. Deliberately **never sends
 * `viewerZoneId`** — the backend rejects it (400) without `date`, and this un-dated call has no
 * day boundary to compute.
 *
 * Infinite so the Matches page can "Load more"; the rail simply reads the first page.
 */
export function useUpcomingSessions({
  sportId,
  enabled,
}: {
  sportId: number | undefined;
  enabled: boolean;
}) {
  return useInfiniteQuery({
    queryKey: sessionKeys.upcoming(sportId),
    queryFn: async ({ pageParam }) => {
      const response = await apiClient.get<PagedApiResponse<Session>>('/sessions/upcoming', {
        params: {
          ...(sportId !== undefined ? { sportId } : {}),
          page: pageParam,
          size: UPCOMING_PAGE_SIZE,
        },
      });
      return response.data.data;
    },
    initialPageParam: 0,
    getNextPageParam,
    enabled,
  });
}
