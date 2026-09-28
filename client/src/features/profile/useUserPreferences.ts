import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/app/apiClient';
import { useAuthStore } from '@/app/authStore';
import type { ApiResponse } from '@/shared/types/api';
import { profileKeys } from './queryKeys';
import type { UserPreferenceResponse } from './types';

/**
 * Wraps `GET /api/users/me/preferences` (U3/U16) — disabled until a user id is known, same
 * gating as {@link useMyProfile}. CLIENT-I18N-1 is this hook's first caller
 * ({@link useSyncUserLocale}, reading only `language`); CLIENT-REF-3 is expected to reuse it
 * for the rest of the fields rather than adding a second preferences fetch.
 *
 * A deactivated caller 404s here (U16) — surfaced as `isError`, same as any other query; there
 * is no special handling since nothing here acts on the failure beyond not updating the locale.
 */
export function useUserPreferences() {
  const userId = useAuthStore((state) => state.user?.id);

  return useQuery({
    queryKey: profileKeys.preferences(),
    queryFn: async () => {
      const response = await apiClient.get<ApiResponse<UserPreferenceResponse>>(
        '/users/me/preferences',
      );
      return response.data.data;
    },
    enabled: userId !== undefined,
  });
}
