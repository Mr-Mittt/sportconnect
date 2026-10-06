import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/app/apiClient';
import {
  restoreCommentsCache,
  snapshotCommentsCache,
  updateCommentInCommentsCache,
} from '../optimisticCommentUpdates';
import { reportPostMutationError } from '../postErrors';
import { feedKeys } from '../queryKeys';

interface UnlikeCommentVariables {
  postId: number;
  commentId: number;
}

/** Wraps DELETE /api/posts/comments/{commentId}/like. Mirrors useLikeComment. */
export function useUnlikeComment() {
  const queryClient = useQueryClient();
  return useMutation({
    meta: { errorDisplay: 'silent' },
    mutationFn: ({ commentId }: UnlikeCommentVariables) =>
      apiClient.delete(`/posts/comments/${commentId}/like`),
    onMutate: async ({ postId, commentId }: UnlikeCommentVariables) => {
      await queryClient.cancelQueries({ queryKey: feedKeys.comments(postId) });
      const previous = snapshotCommentsCache(queryClient, postId);
      updateCommentInCommentsCache(queryClient, postId, commentId, (comment) => ({
        ...comment,
        isLikedByCurrentUser: false,
        likeCount: Math.max(0, comment.likeCount - 1),
      }));
      return { postId, previous };
    },
    onError: (err, _variables, context) => {
      reportPostMutationError(err);
      if (context) restoreCommentsCache(queryClient, context.postId, context.previous);
    },
    onSettled: (_data, _error, { postId }) => {
      queryClient.invalidateQueries({ queryKey: feedKeys.comments(postId) });
    },
  });
}
