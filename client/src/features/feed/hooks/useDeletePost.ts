import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/app/apiClient';
import { removePostFromFeedCaches, restoreFeedCaches, snapshotFeedCaches } from '../optimisticFeedUpdates';
import { feedKeys } from '../queryKeys';

/**
 * Wraps DELETE /api/posts/{postId} (soft delete; owner, or group owner/admin
 * for GROUP_POST/GROUP_BROADCAST). Optimistic (FEED-1): onMutate splices the
 * post out of every mounted feed-shaped query immediately — "removes it from
 * the visible list without a full refetch" is the acceptance criterion, so
 * this doesn't wait on invalidate+refetch for the visual removal. onError
 * restores it; onSettled still invalidates in the background for eventual
 * consistency (e.g. a group feed showing the same post elsewhere).
 */
export function useDeletePost() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (postId: number) => apiClient.delete(`/posts/${postId}`),
    onMutate: async (postId: number) => {
      await queryClient.cancelQueries({ queryKey: feedKeys.all });
      const previous = snapshotFeedCaches(queryClient);
      removePostFromFeedCaches(queryClient, postId);
      return { previous };
    },
    onError: (_err, _postId, context) => {
      if (context) restoreFeedCaches(queryClient, context.previous);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: feedKeys.all }),
  });
}
