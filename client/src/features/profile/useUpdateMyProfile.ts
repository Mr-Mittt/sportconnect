import { useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { apiClient } from '@/app/apiClient';
import { useAuthStore } from '@/app/authStore';
import type { ApiResponse } from '@/shared/types/api';
import { profileKeys } from './queryKeys';
import type { UpdateProfilePayload } from './profileEditDraft';
import type { UserResponse } from './types';

/**
 * PROFILE-5: wraps `PUT /api/users/{userId}/profile` for the logged-in
 * user's own id. On success, patches `profileKeys.myProfile()` directly with
 * the returned row — same "patch, don't refetch" reasoning as
 * `useUpdateGroup`, so `ProfileHeader`/the Edit Profile modal reflect the
 * save immediately without a round-trip refetch.
 *
 * `errorMessage` surfaces the server's own text (`ApiResponse.message`) —
 * same extraction as `useUpdateSport`/`useLogin` — rather than a
 * reimplemented client-side copy of `UpdateProfileRequest`'s `@Size`
 * messages.
 */
export function useUpdateMyProfile() {
  const userId = useAuthStore((state) => state.user?.id);
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async (payload: UpdateProfilePayload) => {
      const response = await apiClient.put<ApiResponse<UserResponse>>(
        `/users/${userId}/profile`,
        payload,
      );
      return response.data.data;
    },
    onSuccess: (user) => {
      if (userId === undefined) return;
      queryClient.setQueryData(profileKeys.myProfile(userId), user);
    },
  });

  const errorMessage = mutation.error
    ? (axios.isAxiosError(mutation.error) &&
        (mutation.error.response?.data as ApiResponse<null> | undefined)?.message) ||
      'Could not save your profile. Please try again.'
    : null;

  return {
    updateProfile: mutation.mutate,
    isPending: mutation.isPending,
    isSuccess: mutation.isSuccess,
    errorMessage,
    reset: mutation.reset,
  };
}
