import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/app/apiClient';
import { friendKeys } from '../queryKeys';
import type { ApiResponse } from '@/shared/types/api';

/**
 * Wraps `DELETE /api/users/friends/{friendId}` (U1's `removeFriend`) — the
 * caller unfriending someone they're currently friends with. `friendId` is
 * the other person's user id, not a request id. Answers 409 `NOT_FRIENDS` (U21) if the pair
 * aren't currently friends; `FriendProfilePanel` only surfaces the entry
 * point when `friendshipStatus === 'FRIENDS'`, so that's a race, not a
 * normal path. Blunt-invalidates `friendKeys.all` on settle, same as every
 * other friend mutation.
 */
export function useUnfriend() {
  const queryClient = useQueryClient();
  return useMutation({
    meta: { errorDisplay: 'inline' },
    mutationFn: async (friendId: string) => {
      await apiClient.delete<ApiResponse<void>>(`/users/friends/${friendId}`);
      return friendId;
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: friendKeys.all }),
  });
}
