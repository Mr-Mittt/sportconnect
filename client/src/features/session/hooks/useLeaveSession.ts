import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/app/apiClient';
import { sessionKeys } from '../queryKeys';

/**
 * Wraps `DELETE /api/sessions/{sessionId}/leave` — also doubles as Decline (INVITED) and Cancel
 * (REQUESTED) since SESSION-9 widened this endpoint's accepted statuses beyond `JOINED`.
 * Rejected backend-side if the caller has no row, or it's already `LEFT`.
 */
export function useLeaveSession() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (sessionId: number) => {
      await apiClient.delete(`/sessions/${sessionId}/leave`);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: sessionKeys.all }),
  });
}
