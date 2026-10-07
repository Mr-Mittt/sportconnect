import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/app/apiClient';
import {
  restoreSessionCommentsCache,
  snapshotSessionCommentsCache,
  updateCommentInSessionCommentsCache,
} from '../optimisticSessionCommentUpdates';
import { reportSessionMutationError } from '../sessionErrors';
import { sessionKeys } from '../queryKeys';

interface UnlikeSessionCommentVariables {
  sessionId: number;
  commentId: number;
}

/** Wraps `DELETE /api/sessions/{sessionId}/comments/{commentId}/like`. Mirrors `useLikeSessionComment`. */
export function useUnlikeSessionComment() {
  const queryClient = useQueryClient();
  return useMutation({
    meta: { errorDisplay: 'silent' },
    mutationFn: ({ sessionId, commentId }: UnlikeSessionCommentVariables) =>
      apiClient.delete(`/sessions/${sessionId}/comments/${commentId}/like`),
    onMutate: async ({ sessionId, commentId }: UnlikeSessionCommentVariables) => {
      await queryClient.cancelQueries({ queryKey: sessionKeys.comments(sessionId) });
      const previous = snapshotSessionCommentsCache(queryClient, sessionId);
      updateCommentInSessionCommentsCache(queryClient, sessionId, commentId, (comment) => ({
        ...comment,
        isLikedByCurrentUser: false,
        likeCount: Math.max(0, comment.likeCount - 1),
      }));
      return { sessionId, previous };
    },
    onError: (err, _variables, context) => {
      reportSessionMutationError(err);
      if (context) restoreSessionCommentsCache(queryClient, context.sessionId, context.previous);
    },
    onSettled: (_data, _error, { sessionId }) => {
      queryClient.invalidateQueries({ queryKey: sessionKeys.comments(sessionId) });
    },
  });
}
