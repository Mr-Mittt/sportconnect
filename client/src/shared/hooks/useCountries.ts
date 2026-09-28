import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/app/apiClient';
import type { ApiResponse } from '@/shared/types/api';
import type { CountryResponse } from '@/shared/types/reference';

/** Constant — one active-country list, shared by every caller. */
export const countriesQueryKey = ['reference', 'countries'] as const;

/**
 * `GET /api/reference/countries` — active countries, by name. Public (no auth); `name` is always
 * English — `GeoLocaleFields` localizes display itself via `Intl.DisplayNames` keyed by `iso2`,
 * never by translating this field. `staleTime: Infinity`, same reasoning as `useLanguages`.
 */
export function useCountries(): {
  data: CountryResponse[];
  isLoading: boolean;
  isError: boolean;
} {
  const query = useQuery({
    queryKey: countriesQueryKey,
    queryFn: async () => {
      const response = await apiClient.get<ApiResponse<CountryResponse[]>>('/reference/countries');
      return response.data.data;
    },
    staleTime: Infinity,
  });

  return {
    data: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
  };
}
