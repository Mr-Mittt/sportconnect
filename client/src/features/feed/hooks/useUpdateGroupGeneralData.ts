import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/app/apiClient';
import { feedKeys } from '../queryKeys';
import type { ApiResponse } from '@/shared/types/api';
import type { GroupInfo, UpdateGroupGeneralDataPayload } from '../types';

interface UpdateGroupGeneralDataVariables {
  groupId: number;
  payload: UpdateGroupGeneralDataPayload;
}

/**
 * Wraps PUT /api/groups/{groupId}/generalData (owner or admin only, B19/GRP-9).
 * Writes the response straight into the `groupInfo(groupId)` cache entry —
 * same "patch, don't refetch" pattern as `useUpdateGroupSettings`. Unlike the
 * old `useUpdateGroup`-based path this replaced, the response here IS a real
 * `GroupInfoResponse` (rules/schedule included), so no manual field-merge
 * workaround is needed.
 */
export function useUpdateGroupGeneralData() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ groupId, payload }: UpdateGroupGeneralDataVariables) => {
      const response = await apiClient.put<ApiResponse<GroupInfo>>(
        `/groups/${groupId}/generalData`,
        payload,
      );
      return response.data.data;
    },
    onSuccess: (info, { groupId }) => {
      queryClient.setQueryData(feedKeys.groupInfo(groupId), info);
    },
  });
}
