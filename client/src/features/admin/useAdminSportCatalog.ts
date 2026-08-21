import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/app/apiClient';
import type { ApiResponse } from '@/shared/types/api';
import type { SportResponse } from '@/shared/types/sport';
import { adminKeys } from './queryKeys';

/**
 * ADMIN-2: the admin-only sport catalogue — `GET /api/sports/all`, which returns
 * **every** sport including deactivated ones.
 *
 * Deliberately not `useSportCatalog()`, and deliberately not a widening of it. That hook
 * wraps the public, active-only `GET /api/sports` and normalizes each row down to a
 * `SportCatalogEntry` (`id`/`key`/`name`/`iconUrl`), dropping exactly the fields this
 * screen exists to edit — `isActive`, `description`, `category`, `minPlayers`,
 * `maxPlayers`. Widening it would also change what every member-facing caller sees, since
 * it is what the app chrome reads.
 *
 * Returns raw `SportResponse` rows rather than a normalized shape: this is an editor over
 * the backend's own field set, so any normalization here would just have to be undone
 * before the `PUT`.
 */
export function useAdminSportCatalog(): {
  data: SportResponse[];
  isLoading: boolean;
  isError: boolean;
} {
  const query = useQuery({
    queryKey: adminKeys.sportsAll(),
    queryFn: async () => {
      const response = await apiClient.get<ApiResponse<SportResponse[]>>('/sports/all');
      return response.data.data;
    },
  });

  return {
    data: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
  };
}
