import type { InfiniteData, QueryClient } from '@tanstack/react-query';
import { feedKeys } from './queryKeys';
import type { Comment, PageResponse } from './types';

type CommentsInfiniteData = InfiniteData<PageResponse<Comment>>;

/**
 * Applies `transformComment` to a single comment within postId's cached
 * comment thread — checked at root level first, then one level into each
 * root comment's `replies` (a reply can never itself have replies, per the
 * backend's A4 constraint, so one level is exhaustive). Used by
 * useLikeComment/useUnlikeComment's optimistic onMutate.
 */
export function updateCommentInCommentsCache(
  queryClient: QueryClient,
  postId: number,
  commentId: number,
  transformComment: (comment: Comment) => Comment,
): void {
  queryClient.setQueryData<CommentsInfiniteData>(feedKeys.comments(postId), (data) => {
    if (!data) return data;
    return {
      ...data,
      pages: data.pages.map((page) => ({
        ...page,
        content: page.content.map((comment) => {
          if (comment.id === commentId) return transformComment(comment);
          if (comment.replies.some((reply) => reply.id === commentId)) {
            return {
              ...comment,
              replies: comment.replies.map((reply) =>
                reply.id === commentId ? transformComment(reply) : reply,
              ),
            };
          }
          return comment;
        }),
      })),
    };
  });
}

/**
 * Removes a comment (root or reply) from postId's cached comment thread.
 * Used by useDeleteComment's optimistic onMutate — "removes it immediately"
 * is the acceptance criterion, so this splices the cache directly rather
 * than waiting on invalidate+refetch.
 */
export function removeCommentFromCommentsCache(
  queryClient: QueryClient,
  postId: number,
  commentId: number,
): void {
  queryClient.setQueryData<CommentsInfiniteData>(feedKeys.comments(postId), (data) => {
    if (!data) return data;
    return {
      ...data,
      pages: data.pages.map((page) => ({
        ...page,
        content: page.content
          .filter((comment) => comment.id !== commentId)
          .map((comment) => ({
            ...comment,
            replies: comment.replies.filter((reply) => reply.id !== commentId),
          })),
      })),
    };
  });
}

/** Snapshot of postId's cached comment thread, for rollback on mutation error. */
export function snapshotCommentsCache(
  queryClient: QueryClient,
  postId: number,
): CommentsInfiniteData | undefined {
  return queryClient.getQueryData<CommentsInfiniteData>(feedKeys.comments(postId));
}

/** Restores a snapshot taken by snapshotCommentsCache — used in onError. */
export function restoreCommentsCache(
  queryClient: QueryClient,
  postId: number,
  snapshot: CommentsInfiniteData | undefined,
): void {
  queryClient.setQueryData(feedKeys.comments(postId), snapshot);
}
