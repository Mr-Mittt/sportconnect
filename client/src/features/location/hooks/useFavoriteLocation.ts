import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/app/apiClient';
import { reportLocationMutationError } from '../locationErrors';
import { locationKeys } from '../queryKeys';

/**
 * Wraps `POST /api/locations/{locationId}/favorite` (LOC-2). `sportId` isn't sent to the
 * backend — it's only carried through so the mutation can invalidate the right sport-scoped
 * favorites cache entry (`locationKeys.favorites(sportId)`) on success.
 *
 * CLIENT-ERR-8: a failure also refetches the favorites (a stale 409 means the list on screen is
 * wrong) and is reported by `reportLocationMutationError` (stale 409s say nothing, the rest toast).
 */
export function useFavoriteLocation() {
  const queryClient = useQueryClient();
  return useMutation({
    meta: { errorDisplay: 'silent' },
    mutationFn: async ({ locationId }: { locationId: number; sportId: number }) => {
      await apiClient.post(`/locations/${locationId}/favorite`);
    },
    onSuccess: (_data, { sportId }) =>
      queryClient.invalidateQueries({ queryKey: locationKeys.favorites(sportId) }),
    onError: (error, { sportId }) => {
      reportLocationMutationError(error);
      void queryClient.invalidateQueries({ queryKey: locationKeys.favorites(sportId) });
    },
  });
}
