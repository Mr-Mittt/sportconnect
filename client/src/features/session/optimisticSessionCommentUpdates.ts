import type { InfiniteData, QueryClient } from '@tanstack/react-query';
import type { Comment, PageResponse } from '@/features/feed/types';
import { sessionKeys } from './queryKeys';

type SessionCommentsInfiniteData = InfiniteData<PageResponse<Comment>>;

/**
 * CLIENT-SESSION-8: session-comment-thread equivalent of
 * `feed/optimisticCommentUpdates.ts` — same one-level-reply cache shape, keyed by
 * `sessionKeys.comments(sessionId)` instead of `feedKeys.comments(postId)`. Kept as its own
 * parallel module rather than parameterizing the feed version, matching this codebase's existing
 * "no shared cross-cutting logic between features" convention (e.g. post-impl/session-impl's
 * duplicated `requireSessionPost` on the backend).
 */
export function updateCommentInSessionCommentsCache(
  queryClient: QueryClient,
  sessionId: number,
  commentId: number,
  transformComment: (comment: Comment) => Comment,
): void {
  queryClient.setQueryData<SessionCommentsInfiniteData>(sessionKeys.comments(sessionId), (data) => {
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

/** Removes a comment (root or reply) from sessionId's cached comment thread. */
export function removeCommentFromSessionCommentsCache(
  queryClient: QueryClient,
  sessionId: number,
  commentId: number,
): void {
  queryClient.setQueryData<SessionCommentsInfiniteData>(sessionKeys.comments(sessionId), (data) => {
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

/** Snapshot of sessionId's cached comment thread, for rollback on mutation error. */
export function snapshotSessionCommentsCache(
  queryClient: QueryClient,
  sessionId: number,
): SessionCommentsInfiniteData | undefined {
  return queryClient.getQueryData<SessionCommentsInfiniteData>(sessionKeys.comments(sessionId));
}

/** Restores a snapshot taken by snapshotSessionCommentsCache — used in onError. */
export function restoreSessionCommentsCache(
  queryClient: QueryClient,
  sessionId: number,
  snapshot: SessionCommentsInfiniteData | undefined,
): void {
  queryClient.setQueryData(sessionKeys.comments(sessionId), snapshot);
}
