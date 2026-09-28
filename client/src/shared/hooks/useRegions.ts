import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/app/apiClient';
import type { ApiResponse } from '@/shared/types/api';
import type { RegionResponse } from '@/shared/types/reference';

/** Scoped by `countryId` — a region list belongs to exactly one country. */
export const regionsQueryKey = (countryId: number) => ['reference', 'countries', countryId, 'regions'] as const;

/**
 * `GET /api/reference/countries/{countryId}/regions` — a country's active regions. Public (no
 * auth); disabled while `countryId` is `null` (no country picked yet). An active country with no
 * seeded regions returns `[]`, not a 404 — `GeoLocaleFields` renders that as a disabled region
 * select with an explanatory label, not an error. `staleTime: Infinity`, same reasoning as
 * `useLanguages`/`useCountries`.
 */
export function useRegions(countryId: number | null): {
  data: RegionResponse[];
  isLoading: boolean;
  isError: boolean;
} {
  const query = useQuery({
    queryKey: regionsQueryKey(countryId ?? -1),
    queryFn: async () => {
      const response = await apiClient.get<ApiResponse<RegionResponse[]>>(
        `/reference/countries/${countryId}/regions`,
      );
      return response.data.data;
    },
    enabled: countryId !== null,
    staleTime: Infinity,
  });

  return {
    data: query.data ?? [],
    // A disabled query sits in `pending` with `isLoading` true, which would render a permanent
    // spinner/disabled state when no country is selected yet — same guard as
    // `useSessionAttributeSchema`'s `sportId` check.
    isLoading: countryId !== null && query.isLoading,
    isError: query.isError,
  };
}
