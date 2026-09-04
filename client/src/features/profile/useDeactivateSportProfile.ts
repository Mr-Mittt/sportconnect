import { useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { apiClient } from '@/app/apiClient';
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
 * `errorMessage` surfaces the server's own text, same extraction as `useUpdateSportProfile`.
 */
export function useDeactivateSportProfile() {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async (profileId: number) => {
      await apiClient.delete<ApiResponse<null>>(`/sports/profiles/${profileId}`);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: sportProfilesQueryKey });
      queryClient.invalidateQueries({ queryKey: sportProfilesWithInactiveQueryKey });
      queryClient.invalidateQueries({ queryKey: [...sessionKeys.all, 'discover'] });
    },
  });

  const errorMessage = mutation.error
    ? (axios.isAxiosError(mutation.error) &&
        (mutation.error.response?.data as ApiResponse<null> | undefined)?.message) ||
      'Could not deactivate that sport profile. Please try again.'
    : null;

  return {
    deactivateSportProfile: mutation.mutate,
    isPending: mutation.isPending,
    isError: mutation.isError,
    errorMessage,
    reset: mutation.reset,
  };
}
