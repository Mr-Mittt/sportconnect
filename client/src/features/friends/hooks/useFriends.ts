import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/app/apiClient';
import { friendKeys } from '../queryKeys';
import type { FriendUser } from '../types';
import type { ApiResponse } from '@/shared/types/api';

/**
 * Wraps `GET /api/users/friends` (U1) — the caller's accepted friends,
 * plain array (not Spring `Page<T>`-shaped, unlike U6's search endpoint).
 * `enabled` (default true) lets a caller that only needs this while some UI
 * is open — e.g. CLIENT-SESSION-4's invite-friend field — skip the request
 * otherwise, same convention as this feature's other gated queries.
 */
export function useFriends(enabled = true) {
  return useQuery({
    queryKey: friendKeys.list(),
    queryFn: async () => {
      const response = await apiClient.get<ApiResponse<FriendUser[]>>('/users/friends');
      return response.data.data;
    },
    enabled,
  });
}
