import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/app/apiClient';
import { sessionKeys } from '../queryKeys';

/**
 * Wraps `POST /api/sessions/{sessionId}/participants/{userId}/approve` — REQUESTED -> JOINED.
 * Same canManage gating as cancelSession/updateSession; rejected if the row isn't REQUESTED
 * (e.g. already resolved, or an INVITED row that bypassed approval on its own).
 */
export function useApproveParticipant() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ sessionId, userId }: { sessionId: number; userId: string }) => {
      await apiClient.post(`/sessions/${sessionId}/participants/${userId}/approve`);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: sessionKeys.all }),
  });
}
