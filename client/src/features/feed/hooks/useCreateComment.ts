import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/app/apiClient';
import { restoreFeedCaches, snapshotFeedCaches, updatePostInFeedCaches } from '../optimisticFeedUpdates';
import { feedKeys } from '../queryKeys';
import type { CreateCommentPayload } from '../types';

interface CreateCommentVariables {
  postId: number;
  payload: CreateCommentPayload;
}

/**
 * Wraps POST /api/posts/{postId}/comments. Only a **root** comment
 * (`payload.parentCommentId` unset) bumps the parent post's `commentCount` —
 * the backend's own counter only increments for root comments, replies only
 * bump their parent comment's `replyCount` (verified against
 * CommentServiceImpl.createComment). onMutate reflects that distinction
 * optimistically; the actual new comment/reply is picked up by invalidating
 * postId's comment thread on success rather than being hand-constructed
 * client-side (avoids guessing at server-assigned id/timestamp/author).
 */
export function useCreateComment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ postId, payload }: CreateCommentVariables) =>
      apiClient.post(`/posts/${postId}/comments`, payload),
    onMutate: async ({ postId, payload }: CreateCommentVariables) => {
      if (payload.parentCommentId !== undefined) return undefined;
      await queryClient.cancelQueries({ queryKey: feedKeys.all });
      const previous = snapshotFeedCaches(queryClient);
      updatePostInFeedCaches(queryClient, postId, (post) => ({
        ...post,
        commentCount: post.commentCount + 1,
      }));
      return { previous };
    },
    onError: (_err, _variables, context) => {
      if (context) restoreFeedCaches(queryClient, context.previous);
    },
    onSuccess: (_data, { postId }) => {
      queryClient.invalidateQueries({ queryKey: feedKeys.comments(postId) });
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: feedKeys.all }),
  });
}
