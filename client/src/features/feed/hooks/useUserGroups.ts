import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/app/apiClient';
import { feedKeys } from '../queryKeys';
import type { Group, PagedApiResponse } from '../types';

/**
 * Wraps GET /api/groups/user/{userId} — populates the group switcher.
 * Disabled while `userId` is undefined (e.g. session not yet bootstrapped),
 * so callers don't need their own `enabled` guard.
 */
export function useUserGroups(userId: string | undefined) {
  return useQuery({
    queryKey: feedKeys.userGroups(userId ?? ''),
    queryFn: async () => {
      const response = await apiClient.get<PagedApiResponse<Group>>(`/groups/user/${userId}`);
      return response.data.data;
    },
    enabled: userId !== undefined,
  });
}
