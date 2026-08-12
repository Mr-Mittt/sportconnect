import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/app/apiClient';
import { feedKeys } from '../queryKeys';
import type { ApiResponse } from '@/shared/types/api';
import type { GroupInfo } from '../types';

/**
 * Wraps GET /api/groups/{groupId}/generalData (B19/GRP-9 — matches PUT
 * .../generalData; the older GET .../info path is no longer mapped to this
 * data, reserved for a different future purpose). Privacy-gated: a
 * non-member of a private group gets a stub (groupId/groupName/isPrivate
 * only); everyone else gets every field. `enabled` gates the fetch to while
 * the Settings tab is active, same reasoning as `useGroupSettings`.
 */
export function useGroupGeneralData(groupId: number | undefined, enabled: boolean) {
  return useQuery({
    queryKey: feedKeys.groupInfo(groupId ?? -1),
    queryFn: async () => {
      const response = await apiClient.get<ApiResponse<GroupInfo>>(`/groups/${groupId}/generalData`);
      return response.data.data;
    },
    enabled: enabled && groupId !== undefined,
  });
}
