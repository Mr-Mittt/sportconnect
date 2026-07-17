import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
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
 * `retry` skips TanStack's default 3-attempt exponential-backoff retry for a
 * 404 specifically — confirmed live against the real backend
 * (`PostServiceImpl.getPostById`'s `NotFoundException` maps to a genuine
 * 404, not a transient failure), so retrying it only delays showing
 * `CommentSection`'s "Couldn't load this post." state by several seconds for
 * an outcome that will never change. Other errors (network blips, 5xx) still
 * get the default retry behavior.
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
    retry: (failureCount, error) => {
      if ((error as AxiosError).response?.status === 404) return false;
      return failureCount < 3;
    },
  });
}
