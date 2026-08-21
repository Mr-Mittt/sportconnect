import { useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { apiClient } from '@/app/apiClient';
import { sportCatalogQueryKey } from '@/shared/hooks/useSportCatalog';
import type { ApiResponse } from '@/shared/types/api';
import type { SportResponse } from '@/shared/types/sport';
import { adminKeys } from './queryKeys';

/** The editable subset of `SportResponse` — 1:1 with `UpdateSportRequest`
 * (`modules/sport/sport-api`). `id`/`createdAt`/`updatedAt` are server-owned. */
export interface UpdateSportPayload {
  name?: string;
  description?: string;
  category?: string;
  iconUrl?: string;
  minPlayers?: number;
  maxPlayers?: number;
  isActive?: boolean;
}

/**
 * ADMIN-2: wraps `PUT /api/sports/{sportId}` — the sport-fields half of the detail panel.
 * The attribute schema is a **separate** endpoint with its own hook; see
 * `useReplaceSportAttributeSchema` for why the two are never saved together.
 *
 * Invalidates two caches on success, both needed:
 * - `adminKeys.sportsAll()` — this screen's own table.
 * - `sportCatalogQueryKey` — SPORT-3's public, active-only catalogue, which the member-facing
 *   chrome reads. Without this, renaming or deactivating a sport leaves the admin's own
 *   TopBar/SportSwitcher serving the stale row until the cache separately expired.
 *
 * `errorMessage` surfaces the server's own text (`ApiResponse.message`), same extraction as
 * `useLogin`. Known rough edge: renaming to a name another sport already holds violates the
 * `sports.name` unique constraint, and `updateSport` has no `existsByName` guard, so it
 * arrives as a generic 500 rather than a readable 400 (backend follow-up, see the ticket doc).
 */
export function useUpdateSport(sportId: number | undefined) {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async (payload: UpdateSportPayload) => {
      const response = await apiClient.put<ApiResponse<SportResponse>>(
        `/sports/${sportId}`,
        payload,
      );
      return response.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminKeys.sportsAll() });
      queryClient.invalidateQueries({ queryKey: sportCatalogQueryKey });
    },
  });

  const errorMessage = mutation.error
    ? (axios.isAxiosError(mutation.error) &&
        (mutation.error.response?.data as ApiResponse<null> | undefined)?.message) ||
      'Could not save the sport. Please try again.'
    : null;

  return {
    updateSport: mutation.mutate,
    isPending: mutation.isPending,
    isSuccess: mutation.isSuccess,
    errorMessage,
    reset: mutation.reset,
  };
}
