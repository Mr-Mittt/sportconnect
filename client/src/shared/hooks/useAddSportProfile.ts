import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/app/apiClient';
import type { ApiResponse } from '@/shared/types/api';
import type { UserSportProfileResponse } from '@/shared/types/sport';
import { sportProfilesQueryKey } from './useSportProfilesForUser';

export interface AddSportProfilePayload {
  sportId: number;
  skillLevel: string;
  yearsOfExperience?: number;
}

/**
 * Wraps `POST /api/sports/profiles` — the "Add sport" flow SportSwitcher's
 * dashed pill opens. Same "write the new item into the query cache
 * directly, then invalidate in the background" shape as `useCreateGroup`:
 * the new profile needs to show up in the switcher immediately, not after a
 * refetch round trip. The backend enforces the 3-profile cap and rejects a
 * duplicate sport (400) — surfaced via `isError`, same as every other
 * mutation-backed modal in this app (CreateGroupModal, JoinGroupModal).
 *
 * `userId` is a hook param (not read from an internal store) so the target
 * cache entry is explicit — same shape as `useCreateGroup(currentUserId)`.
 */
export function useAddSportProfile(userId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: AddSportProfilePayload) => {
      const response = await apiClient.post<ApiResponse<UserSportProfileResponse>>(
        '/sports/profiles',
        payload,
      );
      return response.data.data;
    },
    onSuccess: (profile) => {
      if (userId === undefined) return;
      queryClient.setQueryData<UserSportProfileResponse[]>(
        sportProfilesQueryKey(userId),
        (data) => (data ? [...data, profile] : [profile]),
      );
    },
    onSettled: () => {
      if (userId === undefined) return;
      queryClient.invalidateQueries({ queryKey: sportProfilesQueryKey(userId) });
    },
  });
}
