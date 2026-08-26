import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@/app/authStore';
import { apiClient } from '@/app/apiClient';
import type { ApiResponse } from '@/shared/types/api';
import { profileKeys } from './queryKeys';
import type { UserResponse } from './types';

/**
 * Wraps `GET /api/users/{userId}` for the logged-in user's own id — the
 * first fetch of the *full* `UserResponse` anywhere in the client.
 * `useAuthStore`'s own `User` is only a thin login-projection (no `bio`/
 * `city`/`country`/`coverUrl`), so this is genuinely new data, not a rename
 * of an existing hook. Disabled until a user id is known (e.g. before
 * AUTH-3's session bootstrap resolves).
 */
export function useMyProfile() {
  const userId = useAuthStore((state) => state.user?.id);

  return useQuery({
    queryKey: profileKeys.myProfile(userId ?? ''),
    queryFn: async () => {
      const response = await apiClient.get<ApiResponse<UserResponse>>(`/users/${userId}`);
      return response.data.data;
    },
    enabled: userId !== undefined,
  });
}
