import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/app/apiClient';
import { locationKeys } from '../queryKeys';
import type { Location } from '../types';
import type { PagedApiResponse } from '@/features/feed/types';

/**
 * Wraps `GET /api/locations/favorites?sportId=` (LOC-2) — the caller's favorited locations for
 * one sport. `sportId` is required backend-side (400 without it); `enabled` should stay false
 * until a sport is actually known (CLIENT-SESSION-5: gated on the create form's in-progress
 * effective sport, not just the picker being open).
 */
export function useFavoriteLocations(sportId: number | undefined, enabled: boolean) {
  return useQuery({
    queryKey: locationKeys.favorites(sportId ?? -1),
    queryFn: async () => {
      const response = await apiClient.get<PagedApiResponse<Location>>('/locations/favorites', {
        params: { sportId },
      });
      return response.data.data;
    },
    enabled: enabled && sportId !== undefined,
  });
}
