import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/app/apiClient';
import { friendKeys } from '../queryKeys';
import type { FriendUser } from '../types';
import type { ApiResponse } from '@/shared/types/api';

/**
 * Wraps `GET /api/users/friends` (U1) — the caller's accepted friends,
 * plain array (not Spring `Page<T>`-shaped, unlike U6's search endpoint).
 */
export function useFriends() {
  return useQuery({
    queryKey: friendKeys.list(),
    queryFn: async () => {
      const response = await apiClient.get<ApiResponse<FriendUser[]>>('/users/friends');
      return response.data.data;
    },
  });
}
