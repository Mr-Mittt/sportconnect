import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/app/apiClient';
import { locationKeys } from '../queryKeys';

/** Wraps `DELETE /api/locations/{locationId}/favorite` (LOC-2) — same `sportId`-for-cache-invalidation-only reasoning as `useFavoriteLocation`. */
export function useUnfavoriteLocation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ locationId }: { locationId: number; sportId: number }) => {
      await apiClient.delete(`/locations/${locationId}/favorite`);
    },
    onSuccess: (_data, { sportId }) =>
      queryClient.invalidateQueries({ queryKey: locationKeys.favorites(sportId) }),
  });
}
