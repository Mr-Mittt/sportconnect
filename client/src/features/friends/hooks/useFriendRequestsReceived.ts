import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/app/apiClient';
import { friendKeys } from '../queryKeys';
import type { FriendRequest } from '../types';
import type { ApiResponse } from '@/shared/types/api';

/**
 * Wraps `GET /api/users/friends/requests/received` (U1) — pending requests
 * sent TO the caller (server-filtered to PENDING status only). Each row's
 * `senderId`/`senderName` identifies who's asking.
 */
export function useFriendRequestsReceived() {
  return useQuery({
    queryKey: friendKeys.requestsReceived(),
    queryFn: async () => {
      const response = await apiClient.get<ApiResponse<FriendRequest[]>>(
        '/users/friends/requests/received',
      );
      return response.data.data;
    },
  });
}
