import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { apiClient } from '@/app/apiClient';
import type { ApiResponse } from '@/shared/types/api';
import type { SportCatalogEntry, SportResponse } from '@/shared/types/sport';

export const sportCatalogQueryKey = ['sportCatalog'] as const;

/**
 * SPORT-3: real hook against `GET /api/sports` (public, active-only
 * server-side per sport-impl's A5/A6), replacing `sportProfileConfig.ts`'s
 * old hardcoded `ALL_SPORT_KEYS` and `sportIdMap.ts`'s old hardcoded
 * `SPORT_ID_BY_KEY`. `key` is each returned sport's lowercased `name` — same
 * convention the old hardcoded table used for football/basketball/tennis.
 *
 * `AppShell` is the one place that calls this and mirrors the result into
 * `sportCatalogStore` for synchronous, non-hook access elsewhere; most other
 * call sites (page-level `availableSports` derivations) can call this
 * directly — TanStack Query dedupes by `sportCatalogQueryKey`, so this never
 * issues a second network request per render tree.
 */
export function useSportCatalog(): {
  data: SportCatalogEntry[];
  isLoading: boolean;
  isError: boolean;
} {
  const query = useQuery({
    queryKey: sportCatalogQueryKey,
    queryFn: async () => {
      const response = await apiClient.get<ApiResponse<SportResponse[]>>('/sports');
      return response.data.data;
    },
  });

  const data = useMemo<SportCatalogEntry[]>(
    () =>
      (query.data ?? []).map((sport) => ({
        id: sport.id,
        key: sport.name.toLowerCase(),
        name: sport.name,
      })),
    [query.data],
  );

  return { data, isLoading: query.isLoading, isError: query.isError };
}
