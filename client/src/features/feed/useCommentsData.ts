import { useCallback, useMemo } from 'react';
import { useComments } from '@/features/feed/hooks/useComments';
import { useCreateComment } from '@/features/feed/hooks/useCreateComment';
import { useDeleteComment } from '@/features/feed/hooks/useDeleteComment';
import { useLikeComment } from '@/features/feed/hooks/useLikeComment';
import { useUnlikeComment } from '@/features/feed/hooks/useUnlikeComment';
import type { Comment } from '@/features/feed/types';

/**
 * CommentSection's data boundary — mirrors useHomeFeedData's role, scoped to
 * one post's comment thread instead of the whole feed. `isOpen` gates the
 * underlying query (useComments' `enabled`) so a thread is only fetched
 * while its dialog is actually open, not for every post in the feed.
 *
 * `deleteComment`/`toggleCommentLike` take the full `Comment` object rather
 * than just an id — `parentCommentId` (needed to know whether a delete
 * should touch the parent post's commentCount) and `isLikedByCurrentUser`
 * (needed to pick like vs. unlike) already live on it, so there's no reason
 * to make the caller re-derive or re-pass them separately.
 */
export function useCommentsData(postId: number, isOpen: boolean) {
  const commentsQuery = useComments(postId, isOpen);
  const createMutation = useCreateComment();
  const deleteMutation = useDeleteComment();
  const likeMutation = useLikeComment();
  const unlikeMutation = useUnlikeComment();

  const comments = useMemo(
    () => commentsQuery.data?.pages.flatMap((page) => page.content) ?? [],
    [commentsQuery.data],
  );

  const addComment = useCallback(
    (content: string) => createMutation.mutate({ postId, payload: { content } }),
    [createMutation, postId],
  );

  const addReply = useCallback(
    (parentCommentId: number, content: string) =>
      createMutation.mutate({ postId, payload: { content, parentCommentId } }),
    [createMutation, postId],
  );

  const deleteComment = useCallback(
    (comment: Comment) =>
      deleteMutation.mutate({ postId, commentId: comment.id, parentCommentId: comment.parentCommentId }),
    [deleteMutation, postId],
  );

  const toggleCommentLike = useCallback(
    (comment: Comment) => {
      if (comment.isLikedByCurrentUser) {
        unlikeMutation.mutate({ postId, commentId: comment.id });
      } else {
        likeMutation.mutate({ postId, commentId: comment.id });
      }
    },
    [postId, likeMutation, unlikeMutation],
  );

  return {
    data: comments,
    isLoading: commentsQuery.isLoading,
    isError: commentsQuery.isError,
    hasMore: commentsQuery.hasNextPage ?? false,
    isFetchingMore: commentsQuery.isFetchingNextPage,
    fetchMore: () => commentsQuery.fetchNextPage(),
    addComment,
    addReply,
    isPosting: createMutation.isPending,
    deleteComment,
    toggleCommentLike,
  };
}
