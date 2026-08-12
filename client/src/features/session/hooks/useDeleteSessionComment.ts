import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/app/apiClient';
import {
  removeCommentFromSessionCommentsCache,
  restoreSessionCommentsCache,
  snapshotSessionCommentsCache,
} from '../optimisticSessionCommentUpdates';
import { sessionKeys } from '../queryKeys';

interface DeleteSessionCommentVariables {
  sessionId: number;
  commentId: number;
}

/**
 * Wraps `DELETE /api/posts/comments/{commentId}` — the same generic post-impl endpoint
 * `useDeleteComment` (feed) uses, reused directly for a session comment per SESSION-10's design
 * (`deleteComment` was never gated by `PostGate`, ownership-only, so nothing session-specific is
 * needed here). Optimistic: splices the comment out of sessionId's cached thread immediately,
 * same "removes it immediately" behavior as feed's delete.
 */
export function useDeleteSessionComment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ commentId }: DeleteSessionCommentVariables) =>
      apiClient.delete(`/posts/comments/${commentId}`),
    onMutate: async ({ sessionId, commentId }: DeleteSessionCommentVariables) => {
      await queryClient.cancelQueries({ queryKey: sessionKeys.comments(sessionId) });
      const previous = snapshotSessionCommentsCache(queryClient, sessionId);
      removeCommentFromSessionCommentsCache(queryClient, sessionId, commentId);
      return { sessionId, previous };
    },
    onError: (_err, _variables, context) => {
      if (context) restoreSessionCommentsCache(queryClient, context.sessionId, context.previous);
    },
    onSettled: (_data, _error, { sessionId }) => {
      queryClient.invalidateQueries({ queryKey: sessionKeys.comments(sessionId) });
    },
  });
}
