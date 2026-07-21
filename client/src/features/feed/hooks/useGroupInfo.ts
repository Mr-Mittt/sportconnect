import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/app/apiClient';
import { feedKeys } from '../queryKeys';
import type { ApiResponse } from '@/shared/types/api';
import type { GroupInfo } from '../types';

/**
 * Wraps GET /api/groups/{groupId}/info (any authenticated caller — no
 * membership check server-side). `enabled` gates the fetch to while the
 * Settings tab is active, same reasoning as `useGroupSettings`.
 */
export function useGroupInfo(groupId: number | undefined, enabled: boolean) {
  return useQuery({
    queryKey: feedKeys.groupInfo(groupId ?? -1),
    queryFn: async () => {
      const response = await apiClient.get<ApiResponse<GroupInfo>>(`/groups/${groupId}/info`);
      return response.data.data;
    },
    enabled: enabled && groupId !== undefined,
  });
}
