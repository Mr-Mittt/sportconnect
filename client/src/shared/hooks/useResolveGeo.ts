import { useMutation } from '@tanstack/react-query';
import { apiClient } from '@/app/apiClient';
import type { ApiResponse } from '@/shared/types/api';
import type { ResolveGeoRequest, ResolvedGeoResponse } from '@/shared/types/reference';

/**
 * `POST /api/reference/resolve` — matches browser signals (locales, timezone, optionally
 * coordinates) to active reference rows. Public (no auth); a `200` with every field `null` is the
 * normal "nothing matched" outcome, not an error — surfaced as `data`, never `isError`. A `400`
 * (malformed input — see `ResolveGeoRequest`'s size/range limits) is a real fetch failure and does
 * surface as `isError`; `useGeoLocaleFieldsData` treats it as a no-op rather than showing it, since
 * a pre-fill failing must never block sign-up/profile (the fields stay optional either way).
 *
 * A `useMutation` wrapper rather than `useQuery`: `resolve` is call-triggered (once silently on
 * mount, again from the "Use my current location" button), not a cacheable GET. Still returns the
 * same `{ data, isLoading, isError }` triple as this ticket's other hooks, plus the one extra
 * `resolve` trigger function a mutation needs.
 */
export function useResolveGeo(): {
  resolve: (request: ResolveGeoRequest) => Promise<ResolvedGeoResponse>;
  data: ResolvedGeoResponse | null;
  isLoading: boolean;
  isError: boolean;
} {
  const mutation = useMutation({
    meta: { errorDisplay: 'silent' },
    mutationFn: async (request: ResolveGeoRequest) => {
      const response = await apiClient.post<ApiResponse<ResolvedGeoResponse>>(
        '/reference/resolve',
        request,
      );
      return response.data.data;
    },
  });

  return {
    resolve: mutation.mutateAsync,
    data: mutation.data ?? null,
    isLoading: mutation.isPending,
    isError: mutation.isError,
  };
}
