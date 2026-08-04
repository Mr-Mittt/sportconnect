import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/app/apiClient';
import { locationKeys } from '../queryKeys';

/**
 * Wraps `POST /api/locations/{locationId}/favorite` (LOC-2). `sportId` isn't sent to the
 * backend — it's only carried through so the mutation can invalidate the right sport-scoped
 * favorites cache entry (`locationKeys.favorites(sportId)`) on success.
 */
export function useFavoriteLocation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ locationId }: { locationId: number; sportId: number }) => {
      await apiClient.post(`/locations/${locationId}/favorite`);
    },
    onSuccess: (_data, { sportId }) =>
      queryClient.invalidateQueries({ queryKey: locationKeys.favorites(sportId) }),
  });
}
