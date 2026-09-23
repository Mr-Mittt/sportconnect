import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/app/apiClient';
import type { ApiResponse } from '@/shared/types/api';
import { sessionKeys } from '../queryKeys';
import { buildDiscoverParams, type DiscoverFilters } from '../discoverParams';

export interface DiscoverDateCount {
  date: string; // yyyy-MM-dd
  count: number;
}

interface DiscoverDateCountsResponse {
  counts: DiscoverDateCount[];
}

/**
 * Wraps `GET /api/sessions/discover/counts` (SESSION-39) — per-date counts of discoverable
 * sessions, sharing every `/discover` filter except `date`/pagination. `dates` mirrors the Date
 * filter's checked selection (capped at 8, `MAX_DISCOVER_DATES`); `undefined` on initial load asks
 * for the backend's own default today+7-days window instead (CLIENT-SESSION-22's decision to defer
 * sending an explicit list until the caller actually touches the Date pill).
 */
export function useDiscoverDateCounts(
  filters: DiscoverFilters,
  dates: string[] | undefined,
  enabled: boolean,
) {
  return useQuery({
    queryKey: sessionKeys.discoverCounts(filters, dates),
    queryFn: async () => {
      const response = await apiClient.get<ApiResponse<DiscoverDateCountsResponse>>(
        '/sessions/discover/counts',
        { params: { ...buildDiscoverParams(filters), ...(dates !== undefined ? { date: dates } : {}) } },
      );
      return response.data.data;
    },
    enabled,
  });
}
