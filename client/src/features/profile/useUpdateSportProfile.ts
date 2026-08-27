import { useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { apiClient } from '@/app/apiClient';
import { useAuthStore } from '@/app/authStore';
import { sportProfilesQueryKey } from '@/shared/hooks/useSportProfilesForUser';
import type { ApiResponse } from '@/shared/types/api';
import type { UserSportProfileResponse } from '@/shared/types/sport';
import type { UpdateSportProfilePayload } from './sportProfileEditDraft';

interface UpdateSportProfileVariables {
  profileId: number;
  payload: UpdateSportProfilePayload;
}

/**
 * PROFILE-4: wraps `PUT /api/sports/profiles/{profileId}`. Patches the shared
 * `sportProfilesQueryKey(userId)` cache in place on success (same "patch,
 * don't refetch" reasoning as `useUpdateGroup`/`useUpdateMyProfile`) — that
 * one array backs `useMySportProfilesRaw`, `useSportProfilesForUser`
 * (`SportSwitcher`'s own source), and `useAddSportProfile`, so a save is
 * reflected everywhere on the page immediately, no separate invalidation.
 *
 * `errorMessage` surfaces the server's own text, same extraction as
 * `useUpdateSport`/`useUpdateMyProfile`.
 */
export function useUpdateSportProfile() {
  const userId = useAuthStore((state) => state.user?.id);
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async ({ profileId, payload }: UpdateSportProfileVariables) => {
      const response = await apiClient.put<ApiResponse<UserSportProfileResponse>>(
        `/sports/profiles/${profileId}`,
        payload,
      );
      return response.data.data;
    },
    onSuccess: (updated) => {
      if (userId === undefined) return;
      queryClient.setQueryData<UserSportProfileResponse[]>(sportProfilesQueryKey(userId), (data) =>
        (data ?? []).map((profile) => (profile.id === updated.id ? updated : profile)),
      );
    },
  });

  const errorMessage = mutation.error
    ? (axios.isAxiosError(mutation.error) &&
        (mutation.error.response?.data as ApiResponse<null> | undefined)?.message) ||
      'Could not save your sport profile. Please try again.'
    : null;

  return {
    updateSportProfile: mutation.mutate,
    isPending: mutation.isPending,
    isSuccess: mutation.isSuccess,
    errorMessage,
    reset: mutation.reset,
  };
}
