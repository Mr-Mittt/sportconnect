import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/app/apiClient';
import {
  restoreSessionCommentsCache,
  snapshotSessionCommentsCache,
  updateCommentInSessionCommentsCache,
} from '../optimisticSessionCommentUpdates';
import { sessionKeys } from '../queryKeys';

interface LikeSessionCommentVariables {
  sessionId: number;
  commentId: number;
}

/** Wraps `POST /api/sessions/{sessionId}/comments/{commentId}/like`. Mirrors `useLikeComment`. */
export function useLikeSessionComment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ sessionId, commentId }: LikeSessionCommentVariables) =>
      apiClient.post(`/sessions/${sessionId}/comments/${commentId}/like`),
    onMutate: async ({ sessionId, commentId }: LikeSessionCommentVariables) => {
      await queryClient.cancelQueries({ queryKey: sessionKeys.comments(sessionId) });
      const previous = snapshotSessionCommentsCache(queryClient, sessionId);
      updateCommentInSessionCommentsCache(queryClient, sessionId, commentId, (comment) => ({
        ...comment,
        isLikedByCurrentUser: true,
        likeCount: comment.likeCount + 1,
      }));
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
