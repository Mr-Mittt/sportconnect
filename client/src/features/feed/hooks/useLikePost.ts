import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/app/apiClient';
import {
  restoreFeedCaches,
  snapshotFeedCaches,
  updatePostInFeedCaches,
} from '../optimisticFeedUpdates';
import { feedKeys } from '../queryKeys';

/**
 * Wraps POST /api/posts/{postId}/like. Optimistic (FEED-1): onMutate flips
 * `isLikedByCurrentUser`/increments `likeCount` immediately across every
 * mounted feed-shaped query; onError rolls back to the pre-mutate snapshot
 * (per CLAUDE.md's controlled-like convention — PostCard renders from props,
 * this hook owns the flip). onSettled invalidates in the background either
 * way, reconciling against the server's Redis-backed counter.
 */
export function useLikePost() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (postId: number) => apiClient.post(`/posts/${postId}/like`),
    onMutate: async (postId: number) => {
      await queryClient.cancelQueries({ queryKey: feedKeys.all });
      const previous = snapshotFeedCaches(queryClient);
      updatePostInFeedCaches(queryClient, postId, (post) => ({
        ...post,
        isLikedByCurrentUser: true,
        likeCount: post.likeCount + 1,
      }));
      return { previous };
    },
    onError: (_err, _postId, context) => {
      if (context) restoreFeedCaches(queryClient, context.previous);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: feedKeys.all }),
  });
}
