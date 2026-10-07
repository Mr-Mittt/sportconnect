import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/app/apiClient';
import { reportLocationMutationError } from '../locationErrors';
import { locationKeys } from '../queryKeys';

/** Wraps `DELETE /api/locations/{locationId}/favorite` (LOC-2) — same `sportId`-for-cache-invalidation-only reasoning as `useFavoriteLocation`, and the same CLIENT-ERR-8 failure handling (silent stale 409, refetch the favorites). */
export function useUnfavoriteLocation() {
  const queryClient = useQueryClient();
  return useMutation({
    meta: { errorDisplay: 'silent' },
    mutationFn: async ({ locationId }: { locationId: number; sportId: number }) => {
      await apiClient.delete(`/locations/${locationId}/favorite`);
    },
    onSuccess: (_data, { sportId }) =>
      queryClient.invalidateQueries({ queryKey: locationKeys.favorites(sportId) }),
    onError: (error, { sportId }) => {
      reportLocationMutationError(error);
      void queryClient.invalidateQueries({ queryKey: locationKeys.favorites(sportId) });
    },
  });
}
