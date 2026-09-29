import { useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { apiClient } from '@/app/apiClient';
import type { ApiResponse } from '@/shared/types/api';
import { profileKeys } from './queryKeys';
import type { UserPreferenceResponse } from './types';

/** The editable subset of `UpdateUserPreferenceRequest` (`modules/user/user-api`) this app writes
 * today — CLIENT-REF-3 only ever sends `language`; the request DTO has more fields
 * (`timezone`/`distanceUnit`/notification/privacy) for later preference-editing tickets. */
export interface UpdatePreferencesPayload {
  language: string;
}

/**
 * CLIENT-REF-3: wraps `PUT /api/users/me/preferences` (U3/U16). Same shape as
 * `useUpdateMyProfile` — patches `profileKeys.preferences()` directly with the returned row on
 * success (not a refetch), which is also how the UI's language actually switches: `useSyncUserLocale`
 * already reacts to that same query's data changing and pushes it into `localeStore`, so this hook
 * doesn't need its own `localeStore` call.
 *
 * A deactivated caller 404s here (U16), and an inactive `language` code 400s — both surface via
 * `errorMessage`, same server-text extraction as `useUpdateMyProfile`.
 */
export function useUpdateMyPreferences() {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async (payload: UpdatePreferencesPayload) => {
      const response = await apiClient.put<ApiResponse<UserPreferenceResponse>>(
        '/users/me/preferences',
        payload,
      );
      return response.data.data;
    },
    onSuccess: (preferences) => {
      queryClient.setQueryData(profileKeys.preferences(), preferences);
    },
  });

  const errorMessage = mutation.error
    ? (axios.isAxiosError(mutation.error) &&
        (mutation.error.response?.data as ApiResponse<null> | undefined)?.message) ||
      'Could not save your language preference. Please try again.'
    : null;

  return {
    updatePreferences: mutation.mutateAsync,
    isPending: mutation.isPending,
    isSuccess: mutation.isSuccess,
    errorMessage,
    reset: mutation.reset,
  };
}
