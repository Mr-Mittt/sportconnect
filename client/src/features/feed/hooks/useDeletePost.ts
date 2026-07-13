import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/app/apiClient';
import { feedKeys } from '../queryKeys';

/**
 * Wraps DELETE /api/posts/{postId} (soft delete; owner, or group owner/admin
 * for GROUP_POST/GROUP_BROADCAST). Invalidates every feed-related query on
 * success so the deleted post disappears from any mounted list.
 */
export function useDeletePost() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (postId: number) => apiClient.delete(`/posts/${postId}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: feedKeys.all }),
  });
}
