import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/app/apiClient';
import { removeCommentFromCommentsCache } from '../optimisticCommentUpdates';
import { restoreFeedCaches, snapshotFeedCaches, updatePostInFeedCaches } from '../optimisticFeedUpdates';
import { feedKeys } from '../queryKeys';

interface DeleteCommentVariables {
  postId: number;
  commentId: number;
  /** null/undefined for a root comment — mirrors CommentResponse.parentCommentId. */
  parentCommentId: number | null | undefined;
}

/**
 * Wraps DELETE /api/posts/comments/{commentId} (soft delete, owner-only).
 * Only decrementing a **root** comment touches the parent post's
 * `commentCount` (see useCreateComment's note — same backend counter,
 * opposite direction). Optimistic: splices the comment out of postId's
 * cached thread immediately ("removes it immediately" is the acceptance
 * criterion).
 *
 * Snapshot/restore is scoped to `feedKeys.all`, not a separate
 * comments-only snapshot — `feedKeys.comments(postId)` is itself nested
 * under `feedKeys.all` (queryKeys.ts), so a single broad snapshot already
 * covers both the post's `commentCount` and the comment thread. Taking two
 * overlapping snapshots (one broad, one comments-only) is not just
 * redundant — the broad one, captured after the comments-only splice
 * already ran, would restore the *already-emptied* thread on rollback and
 * silently clobber the correct restore. One snapshot, taken before either
 * mutation, avoids that ordering trap entirely.
 */
export function useDeleteComment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ commentId }: DeleteCommentVariables) =>
      apiClient.delete(`/posts/comments/${commentId}`),
    onMutate: async ({ postId, commentId, parentCommentId }: DeleteCommentVariables) => {
      await queryClient.cancelQueries({ queryKey: feedKeys.all });
      const previous = snapshotFeedCaches(queryClient);
      removeCommentFromCommentsCache(queryClient, postId, commentId);
      if (parentCommentId === null || parentCommentId === undefined) {
        updatePostInFeedCaches(queryClient, postId, (post) => ({
          ...post,
          commentCount: Math.max(0, post.commentCount - 1),
        }));
      }
      return { previous };
    },
    onError: (_err, _variables, context) => {
      if (context) restoreFeedCaches(queryClient, context.previous);
    },
    onSettled: (_data, _error, { postId }) => {
      queryClient.invalidateQueries({ queryKey: feedKeys.comments(postId) });
      queryClient.invalidateQueries({ queryKey: feedKeys.all });
    },
  });
}
