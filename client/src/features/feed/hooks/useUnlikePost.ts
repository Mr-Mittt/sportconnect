import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/app/apiClient';
import {
  restoreFeedCaches,
  snapshotFeedCaches,
  updatePostInFeedCaches,
} from '../optimisticFeedUpdates';
import { reportPostMutationError } from '../postErrors';
import { feedKeys } from '../queryKeys';

/** Wraps DELETE /api/posts/{postId}/like. See useLikePost.ts's doc comment — same optimistic convention, inverted. */
export function useUnlikePost() {
  const queryClient = useQueryClient();
  return useMutation({
    meta: { errorDisplay: 'silent' },
    mutationFn: (postId: number) => apiClient.delete(`/posts/${postId}/like`),
    onMutate: async (postId: number) => {
      await queryClient.cancelQueries({ queryKey: feedKeys.all });
      const previous = snapshotFeedCaches(queryClient);
      updatePostInFeedCaches(queryClient, postId, (post) => ({
        ...post,
        isLikedByCurrentUser: false,
        likeCount: Math.max(0, post.likeCount - 1),
      }));
      return { previous };
    },
    onError: (err, _postId, context) => {
      reportPostMutationError(err);
      if (context) restoreFeedCaches(queryClient, context.previous);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: feedKeys.all }),
  });
}
