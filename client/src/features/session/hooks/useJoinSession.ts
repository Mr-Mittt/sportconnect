import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/app/apiClient';
import { sessionKeys } from '../queryKeys';

/**
 * Wraps `POST /api/sessions/{sessionId}/join` — group-linked sessions require group
 * membership backend-side, standalone is open. Upserts (an existing `LEFT` row flips back to
 * `JOINED`), so this is safe to call even if the caller already left once.
 */
export function useJoinSession() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (sessionId: number) => {
      await apiClient.post(`/sessions/${sessionId}/join`);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: sessionKeys.all }),
  });
}
