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
  /**
   * SPORT-5: re-read the catalogue on demand, so a sport an admin activated mid-session
   * is picked up at the moment the user reaches for "Add sport".
   *
   * The query is already `staleTime: 0` (no `QueryClient` defaults are set — see
   * `main.tsx`), so it refetches on mount and on window focus. What it does *not* do is
   * refetch at click time, which is the whole gap this closes: a session that stays
   * mounted and never loses focus keeps serving whatever it last saw.
   *
   * Resolves to the fresh list, or the cached one if the request fails — callers must not
   * treat a failed refetch as "there are no more sports" (see `NoSportsToAddDialog`).
   */
  refetch: () => Promise<SportCatalogEntry[]>;
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
        iconUrl: sport.iconUrl,
      })),
    [query.data],
  );

  return {
    data,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: async () => {
      const result = await query.refetch();
      // `refetch()` rejects nothing and sets `isError` instead, so a failure surfaces here
      // as `data: undefined` — fall back to the last good list rather than an empty one,
      // which a caller would otherwise read as "every sport is already held".
      const fresh = result.data;
      if (fresh === undefined) return data;
      return fresh.map((sport) => ({
        id: sport.id,
        key: sport.name.toLowerCase(),
        name: sport.name,
        iconUrl: sport.iconUrl,
      }));
    },
  };
}
