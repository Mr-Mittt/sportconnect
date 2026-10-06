import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/app/apiClient';
import { reportSessionMutationError } from '../sessionErrors';
import { sessionKeys } from '../queryKeys';

/**
 * Wraps `POST /api/sessions/{sessionId}/like` — likes the session's own `SESSION_POST` anchor.
 * No optimistic update, same simplicity as `useJoinSession`/`useLeaveSession`/`useCancelSession`
 * — just invalidates every cached session query on success, letting the next fetch pick up the
 * real `likeCount`/`isLikedByCurrentUser`.
 */
export function useLikeSession() {
  const queryClient = useQueryClient();
  return useMutation({
    meta: { errorDisplay: 'silent' },
    onError: reportSessionMutationError,
    mutationFn: async (sessionId: number) => {
      await apiClient.post(`/sessions/${sessionId}/like`);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: sessionKeys.all }),
  });
}
