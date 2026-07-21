import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/app/apiClient';
import { feedKeys } from '../queryKeys';
import type { ApiResponse } from '@/shared/types/api';
import type { GroupSettings } from '../types';

/**
 * Wraps GET /api/groups/{groupId}/settings (any member can read). `enabled`
 * gates the fetch so settings are only requested while the Settings tab is
 * actually active, not for every group switch — same reasoning as
 * `useComments`' `enabled` gating on its dialog-open state.
 */
export function useGroupSettings(groupId: number | undefined, enabled: boolean) {
  return useQuery({
    queryKey: feedKeys.groupSettings(groupId ?? -1),
    queryFn: async () => {
      const response = await apiClient.get<ApiResponse<GroupSettings>>(`/groups/${groupId}/settings`);
      return response.data.data;
    },
    enabled: enabled && groupId !== undefined,
  });
}
