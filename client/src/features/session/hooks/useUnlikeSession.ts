import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/app/apiClient';
import { reportSessionMutationError } from '../sessionErrors';
import { sessionKeys } from '../queryKeys';

/** Wraps `DELETE /api/sessions/{sessionId}/like`. Mirrors `useLikeSession`. */
export function useUnlikeSession() {
  const queryClient = useQueryClient();
  return useMutation({
    meta: { errorDisplay: 'silent' },
    onError: reportSessionMutationError,
    mutationFn: async (sessionId: number) => {
      await apiClient.delete(`/sessions/${sessionId}/like`);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: sessionKeys.all }),
  });
}
