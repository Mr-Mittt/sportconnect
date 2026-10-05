import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/app/apiClient';
import { getErrorMessage } from '@/shared/lib/apiError';
import { sessionKeys } from '@/features/session/queryKeys';
import {
  sportProfilesQueryKey,
  sportProfilesWithInactiveQueryKey,
} from '@/shared/hooks/useRawMySportProfiles';
import type { ApiResponse } from '@/shared/types/api';

/**
 * SPORT-10: wraps `DELETE /api/sports/profiles/{profileId}` — the soft delete behind the profile
 * Settings tab's Active toggle. On settle it invalidates the same three keys `useAddSportProfile`
 * does (active list, `?includeInactive` list, discover) so the deactivated sport disappears from
 * the switcher, appears as a muted pill, and Discover stops offering it.
 *
 * `errorMessage` is `getErrorMessage` (localized by error code); `error` is exposed so the confirm dialog can
 * show `getCodedErrorMessage(error)` (CLIENT-ERR-4).
 */
export function useDeactivateSportProfile() {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    meta: { errorDisplay: 'inline' },
    mutationFn: async (profileId: number) => {
      await apiClient.delete<ApiResponse<null>>(`/sports/profiles/${profileId}`);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: sportProfilesQueryKey });
      queryClient.invalidateQueries({ queryKey: sportProfilesWithInactiveQueryKey });
      queryClient.invalidateQueries({ queryKey: [...sessionKeys.all, 'discover'] });
    },
  });

  const errorMessage = mutation.error ? getErrorMessage(mutation.error) : null;

  return {
    deactivateSportProfile: mutation.mutate,
    isPending: mutation.isPending,
    isError: mutation.isError,
    /** The raw failure, for `getCodedErrorMessage` (CLIENT-ERR-4). */
    error: mutation.error,
    errorMessage,
    reset: mutation.reset,
  };
}
