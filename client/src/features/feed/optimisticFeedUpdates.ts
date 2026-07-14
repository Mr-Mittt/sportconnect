import type { InfiniteData, QueryClient } from '@tanstack/react-query';
import { feedKeys } from './queryKeys';
import type { PageResponse, Post } from './types';

type FeedInfiniteData = InfiniteData<PageResponse<Post>>;

/**
 * Applies `transformPost` to every cached page of every currently-mounted
 * feed-shaped query (personalFeed, groupFeed, hashtagPosts — anything under
 * `feedKeys.all`), returning postId unchanged if not found on that page.
 * Used by useLikePost/useUnlikePost's optimistic onMutate so a like flip is
 * reflected in whichever feed view(s) currently have this post rendered,
 * without needing to know which specific feed is mounted.
 */
export function updatePostInFeedCaches(
  queryClient: QueryClient,
  postId: number,
  transformPost: (post: Post) => Post,
): void {
  queryClient.setQueriesData<FeedInfiniteData>({ queryKey: feedKeys.all }, (data) => {
    if (!data) return data;
    return {
      ...data,
      pages: data.pages.map((page) => ({
        ...page,
        content: page.content.map((post) => (post.id === postId ? transformPost(post) : post)),
      })),
    };
  });
}

/**
 * Removes postId from every cached page of every feed-shaped query.
 * Used by useDeletePost's optimistic onMutate — the acceptance criterion is
 * "removes it from the visible list without a full refetch", so this splices
 * the cache directly rather than waiting on invalidate+refetch.
 */
export function removePostFromFeedCaches(queryClient: QueryClient, postId: number): void {
  queryClient.setQueriesData<FeedInfiniteData>({ queryKey: feedKeys.all }, (data) => {
    if (!data) return data;
    return {
      ...data,
      pages: data.pages.map((page) => ({
        ...page,
        content: page.content.filter((post) => post.id !== postId),
        numberOfElements: page.content.filter((post) => post.id !== postId).length,
      })),
    };
  });
}

/** Snapshot of every feed-shaped query's cached data, for rollback on mutation error. */
export function snapshotFeedCaches(queryClient: QueryClient): [readonly unknown[], unknown][] {
  return queryClient.getQueriesData({ queryKey: feedKeys.all });
}

/** Restores a snapshot taken by snapshotFeedCaches — used in onError. */
export function restoreFeedCaches(
  queryClient: QueryClient,
  snapshot: [readonly unknown[], unknown][],
): void {
  for (const [queryKey, data] of snapshot) {
    queryClient.setQueryData(queryKey, data);
  }
}
