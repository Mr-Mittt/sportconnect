import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/app/apiClient';
import { feedKeys } from '../queryKeys';
import type { ApiResponse } from '@/shared/types/api';
import type { GroupSettings, UpdateGroupSettingsPayload } from '../types';

interface UpdateGroupSettingsVariables {
  groupId: number;
  payload: UpdateGroupSettingsPayload;
}

/**
 * Wraps PUT /api/groups/{groupId}/settings (owner only, per B7). Writes the
 * response straight into the `groupSettings(groupId)` cache entry — same
 * "patch, don't refetch" pattern as `useUpdateGroup`.
 */
export function useUpdateGroupSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ groupId, payload }: UpdateGroupSettingsVariables) => {
      const response = await apiClient.put<ApiResponse<GroupSettings>>(
        `/groups/${groupId}/settings`,
        payload,
      );
      return response.data.data;
    },
    onSuccess: (settings, { groupId }) => {
      queryClient.setQueryData(feedKeys.groupSettings(groupId), settings);
    },
  });
}
