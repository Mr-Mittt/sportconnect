import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/app/apiClient';
import { sessionKeys } from '../queryKeys';

/** Wraps `DELETE /api/sessions/{sessionId}/like`. Mirrors `useLikeSession`. */
export function useUnlikeSession() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (sessionId: number) => {
      await apiClient.delete(`/sessions/${sessionId}/like`);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: sessionKeys.all }),
  });
}
