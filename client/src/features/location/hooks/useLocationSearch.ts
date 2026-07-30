import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/app/apiClient';
import { locationKeys } from '../queryKeys';
import type { Location } from '../types';
import type { PagedApiResponse } from '@/features/feed/types';

/**
 * Wraps `GET /api/locations/search?sportId=&q=` — CLIENT-LOC-1's sport-scoped typeahead
 * (LOC-1: `Location` is always specific to one sport, no unscoped search exists).
 * `enabled` is owned by the caller — `useLocationPickerData` gates on a submitted keyword,
 * same submit-triggered pattern as `usePublicGroups`/`JoinGroupModal` (no live-as-you-type
 * `Command`/Combobox primitive exists in this codebase yet).
 */
export function useLocationSearch(sportId: number, keyword: string, enabled: boolean) {
  return useQuery({
    queryKey: locationKeys.search(sportId, keyword),
    queryFn: async () => {
      const response = await apiClient.get<PagedApiResponse<Location>>('/locations/search', {
        params: { sportId, ...(keyword !== '' ? { q: keyword } : {}) },
      });
      return response.data.data;
    },
    enabled,
  });
}
