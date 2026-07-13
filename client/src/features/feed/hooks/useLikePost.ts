import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/app/apiClient';
import { feedKeys } from '../queryKeys';

/**
 * Wraps POST /api/posts/{postId}/like. Invalidates every feed-related query
 * on success so any mounted list refetches the corrected like count/state —
 * a plain, un-optimistic mutation. FEED-1 layers true optimistic
 * update-then-rollback UI on top of this (per CLAUDE.md's controlled-like
 * convention), which is that ticket's concern, not this foundation ticket's.
 */
export function useLikePost() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (postId: number) => apiClient.post(`/posts/${postId}/like`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: feedKeys.all }),
  });
}
