import { useInfiniteQuery } from '@tanstack/react-query';
import { apiClient } from '@/app/apiClient';
import { getNextPageParam } from '@/features/feed/pagination';
import type { PagedApiResponse } from '@/features/feed/types';
import type { Session } from '@/shared/types/session';
import { sessionKeys } from '../queryKeys';

const REQUESTED_PAGE_SIZE = 10; // matches DISCOVER_PAGE_SIZE — no documented backend default to defer to instead.

/**
 * CLIENT-SESSION-29 — `GET /sessions/requested` (backend SESSION-42, shipped, zero prior client
 * callers): the caller's own pending `REQUESTED` join requests, standalone or group-linked,
 * `PREPARING`/`SCHEDULED`/`ONGOING`. No filter params at all — unlike `/discover`, this endpoint
 * takes only `Pageable`. `groupName` resolution (a group-linked request needs one, `/discover`
 * never does since it's standalone-only) is the caller's job — same pattern
 * `useMatchesPageData.ts`'s own `mySessionDateGroups` already uses against its own `groups` list,
 * reused here rather than fetching that list twice.
 */
export function useRequestedSessions(enabled: boolean) {
  return useInfiniteQuery({
    queryKey: sessionKeys.requested(),
    queryFn: async ({ pageParam }) => {
      const response = await apiClient.get<PagedApiResponse<Session>>('/sessions/requested', {
        params: { page: pageParam, size: REQUESTED_PAGE_SIZE },
      });
      return response.data.data;
    },
    initialPageParam: 0,
    getNextPageParam,
    enabled,
  });
}
