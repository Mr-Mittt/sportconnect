import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/app/apiClient';
import { sessionKeys } from '../queryKeys';

/**
 * Wraps `POST /api/sessions/{sessionId}/participants/{userId}/reject` — REQUESTED -> LEFT, with
 * an optional reason persisted on the participant row. Same gating/exceptions as approve.
 */
export function useRejectParticipant() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      sessionId,
      userId,
      reason,
    }: {
      sessionId: number;
      userId: string;
      reason?: string;
    }) => {
      await apiClient.post(`/sessions/${sessionId}/participants/${userId}/reject`, {
        reason: reason || undefined,
      });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: sessionKeys.all }),
  });
}
