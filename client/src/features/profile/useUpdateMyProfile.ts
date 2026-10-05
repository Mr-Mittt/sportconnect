import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/app/apiClient';
import { getErrorMessage } from '@/shared/lib/apiError';
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
 * `errorMessage` is `getErrorMessage(error)` (CLIENT-ERR-1/3): localized copy for a coded error
 * (e.g. `HEIGHT_OUT_OF_RANGE`), else the server's own text (`ApiResponse.message`) —
 * same extraction as `useUpdateSport`/`useLogin` — rather than a
 * reimplemented client-side copy of `UpdateProfileRequest`'s `@Size`
 * messages.
 */
export function useUpdateMyProfile() {
  const userId = useAuthStore((state) => state.user?.id);
  const queryClient = useQueryClient();

  const mutation = useMutation({
    meta: { errorDisplay: 'inline' },
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

  const errorMessage = mutation.error ? getErrorMessage(mutation.error) : null;

  return {
    updateProfile: mutation.mutate,
    // CLIENT-REF-3: `useEditProfileSave` awaits both this and `useUpdateMyPreferences` to report
    // which side failed distinctly — `mutate` (fire-and-forget) can't be awaited.
    updateProfileAsync: mutation.mutateAsync,
    isPending: mutation.isPending,
    isSuccess: mutation.isSuccess,
    errorMessage,
    reset: mutation.reset,
  };
}
