import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/app/apiClient';
import type { ApiResponse } from '@/shared/types/api';
import { findPostInFeedCaches } from '../optimisticFeedUpdates';
import { feedKeys } from '../queryKeys';
import type { Post } from '../types';

/**
 * Wraps GET /api/posts/{postId} (FEED-12) — a dedicated single-post fetch,
 * decoupling `CommentSection` from whichever feed/hashtag cache happened to
 * already have the post loaded. Two consumers: opening the dialog from an
 * already-loaded feed (should not trigger a redundant fetch), and a cold
 * `/posts/:id` load with no prior feed fetch at all (must fetch for real).
 *
 * `initialData` seeds from any currently-mounted feed-shaped query that
 * already has this post (`findPostInFeedCaches`); `staleTime` keeps that
 * seeded data from being immediately treated as stale and re-fetched in the
 * background on mount (TanStack's default `staleTime: 0` would otherwise
 * defeat the point of seeding it at all).
 *
 * No per-query `retry`: the app default (`shouldRetry`) already skips a 404 or 403 — the post is
 * gone or hidden, not a transient failure — and keeps the usual retries for network/5xx.
 */
export function usePost(postId: number, enabled = true) {
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: feedKeys.post(postId),
    queryFn: async () => {
      const response = await apiClient.get<ApiResponse<Post>>(`/posts/${postId}`);
      return response.data.data;
    },
    initialData: () => findPostInFeedCaches(queryClient, postId),
    staleTime: 30_000,
    enabled,
  });
}
