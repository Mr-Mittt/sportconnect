import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/app/apiClient';
import { friendKeys } from '../queryKeys';
import type { ApiResponse } from '@/shared/types/api';

/**
 * Wraps `POST /api/users/friends/requests` (U1). Answers 409 (U21: `ALREADY_FRIENDS`,
 * `FRIEND_REQUEST_ALREADY_PENDING`) if already friends or pending — the caller
 * (`useFriendsPageData`) gates the "Send a friend request" action on the
 * selected person's real `FriendshipStatus === 'NONE'`, not always-enabled,
 * so this is never called against an already-pending pair in normal use.
 */
export function useSendFriendRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (receiverId: string) => {
      await apiClient.post<ApiResponse<void>>('/users/friends/requests', { receiverId });
      return receiverId;
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: friendKeys.all }),
  });
}
