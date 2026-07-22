import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/app/apiClient';
import { friendKeys } from '../queryKeys';
import type { FriendRequest } from '../types';
import type { ApiResponse } from '@/shared/types/api';

/**
 * Wraps `GET /api/users/friends/requests/sent` (U1) — pending requests the
 * caller sent (server-filtered to PENDING status only). Each row's
 * `receiverId`/`receiverName` identifies who hasn't responded yet.
 */
export function useFriendRequestsSent() {
  return useQuery({
    queryKey: friendKeys.requestsSent(),
    queryFn: async () => {
      const response = await apiClient.get<ApiResponse<FriendRequest[]>>(
        '/users/friends/requests/sent',
      );
      return response.data.data;
    },
  });
}
