import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/app/apiClient';
import { feedKeys } from '../queryKeys';

/** Wraps DELETE /api/posts/{postId}/like. See useLikePost.ts's doc comment — same convention. */
export function useUnlikePost() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (postId: number) => apiClient.delete(`/posts/${postId}/like`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: feedKeys.all }),
  });
}
