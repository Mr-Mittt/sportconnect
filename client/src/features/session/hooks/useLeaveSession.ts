import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/app/apiClient';
import { sessionKeys } from '../queryKeys';

/** Wraps `DELETE /api/sessions/{sessionId}/leave` — rejected backend-side if not currently `JOINED`. */
export function useLeaveSession() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (sessionId: number) => {
      await apiClient.delete(`/sessions/${sessionId}/leave`);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: sessionKeys.all }),
  });
}
