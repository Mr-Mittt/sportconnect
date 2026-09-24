import { useInfiniteQuery } from '@tanstack/react-query';
import { apiClient } from '@/app/apiClient';
import type { ApiResponse } from '@/shared/types/api';
import { getViewerZoneId } from '@/shared/lib/viewerZone';
import { sessionKeys } from '../queryKeys';
import type { SessionHistoryDatesResponse } from '../types';

/** How many distinct history dates one page (and each "Load more") fetches — the ticket's
 * `dateCount=20`. */
export const HISTORY_DATE_COUNT = 20;

/**
 * CLIENT-SESSION-23 — `GET /sessions/history?dateCount=` (backend SESSION-27/34/43): the caller's
 * last N distinct history dates for one sport, most-recent-first, each with its per-date count.
 * Pagination is over *dates*: the next page passes the last returned date as `before` (exclusive),
 * and `hasMore` says whether a strictly-older date exists.
 *
 * `sportId` is **required** by the backend (SESSION-43) — the query stays disabled until the
 * caller has an active sport. `viewerZoneId` is sent on every call so a date buckets in the
 * viewer's own zone, the same zone `useHistoryDateSessions` then asks that date's sessions in.
 * Collapsed date rows are cheap: this call carries only `(date, count)`, never sessions.
 */
export function useHistoryDates(sportId: number | undefined) {
  const viewerZoneId = getViewerZoneId();
  return useInfiniteQuery({
    queryKey: sessionKeys.historyDates(sportId ?? 0, viewerZoneId),
    queryFn: async ({ pageParam }) => {
      const response = await apiClient.get<ApiResponse<SessionHistoryDatesResponse>>('/sessions/history', {
        params: {
          dateCount: HISTORY_DATE_COUNT,
          sportId,
          viewerZoneId,
          ...(pageParam !== undefined ? { before: pageParam } : {}),
        },
      });
      return response.data.data;
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) =>
      lastPage.hasMore && lastPage.dates.length > 0
        ? lastPage.dates[lastPage.dates.length - 1].date
        : undefined,
    enabled: sportId !== undefined,
  });
}
