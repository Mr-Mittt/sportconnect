import { useInfiniteQuery } from '@tanstack/react-query';
import { apiClient } from '@/app/apiClient';
import { getNextPageParam } from '@/features/feed/pagination';
import type { PagedApiResponse } from '@/features/feed/types';
import { getViewerZoneId } from '@/shared/lib/viewerZone';
import type { Session } from '@/shared/types/session';
import { sessionKeys } from '../queryKeys';

export const HISTORY_DATE_PAGE_SIZE = 20;

/**
 * CLIENT-SESSION-23 — `GET /sessions/history?date=` (backend SESSION-27/35/43): one history
 * date's own sessions — `JOINED`-only, `CANCELLED`/`COMPLETED`, for one sport, newest-first
 * within the day, paginated 20 at a time (a single date with more than 20 sessions is the
 * nested "Load more" edge case).
 *
 * Meant to be called from a component that only mounts while its date row is expanded
 * (`HistoryDateSessions`) — mounting *is* the laziness, so there is no `enabled` flag to juggle.
 * `viewerZoneId` matches what `useHistoryDates` sent, so `date` means the same calendar day in
 * both calls. TanStack Query's cache makes a collapse-then-re-expand a no-op until stale.
 */
export function useHistoryDateSessions(date: string, sportId: number) {
  const viewerZoneId = getViewerZoneId();
  return useInfiniteQuery({
    queryKey: sessionKeys.historyDate(sportId, date, viewerZoneId),
    queryFn: async ({ pageParam }) => {
      const response = await apiClient.get<PagedApiResponse<Session>>('/sessions/history', {
        params: { date, sportId, viewerZoneId, page: pageParam, size: HISTORY_DATE_PAGE_SIZE },
      });
      return response.data.data;
    },
    initialPageParam: 0,
    getNextPageParam,
  });
}
