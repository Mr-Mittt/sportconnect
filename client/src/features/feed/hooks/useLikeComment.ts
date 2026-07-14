import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/app/apiClient';
import {
  restoreCommentsCache,
  snapshotCommentsCache,
  updateCommentInCommentsCache,
} from '../optimisticCommentUpdates';
import { feedKeys } from '../queryKeys';

interface LikeCommentVariables {
  postId: number;
  commentId: number;
}

/**
 * Wraps POST /api/posts/comments/{commentId}/like. Optimistic, scoped to
 * postId's cached comment thread only (unlike post likes, a comment's like
 * state never needs to sync across multiple mounted queries — it only ever
 * lives in one place, its parent post's thread).
 */
export function useLikeComment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ commentId }: LikeCommentVariables) =>
      apiClient.post(`/posts/comments/${commentId}/like`),
    onMutate: async ({ postId, commentId }: LikeCommentVariables) => {
      await queryClient.cancelQueries({ queryKey: feedKeys.comments(postId) });
      const previous = snapshotCommentsCache(queryClient, postId);
      updateCommentInCommentsCache(queryClient, postId, commentId, (comment) => ({
        ...comment,
        isLikedByCurrentUser: true,
        likeCount: comment.likeCount + 1,
      }));
      return { postId, previous };
    },
    onError: (_err, _variables, context) => {
      if (context) restoreCommentsCache(queryClient, context.postId, context.previous);
    },
    onSettled: (_data, _error, { postId }) => {
      queryClient.invalidateQueries({ queryKey: feedKeys.comments(postId) });
    },
  });
}
