import { useMutation } from '@tanstack/react-query';
import { apiClient } from '@/app/apiClient';
import type { ResolvedMapsUrl } from '../types';
import type { ApiResponse } from '@/shared/types/api';

/**
 * Wraps `POST /api/locations/resolve-maps-url` — parses (or, for short `maps.app.goo.gl`
 * links, resolves via the backend's SSRF-guarded redirect follow) coordinates from a pasted
 * Google Maps share link. Does not persist anything; a null `latitude`/`longitude` in the
 * result is a valid outcome (unresolvable link), not a mutation error — the caller falls back
 * to manual pin placement/entry.
 */
export function useResolveMapsUrl() {
  return useMutation({
    mutationFn: async (url: string) => {
      const response = await apiClient.post<ApiResponse<ResolvedMapsUrl>>('/locations/resolve-maps-url', {
        url,
      });
      return response.data.data;
    },
  });
}
