import { useCallback, useMemo, useState } from 'react';
import type { MentionSource } from '@/shared/components/MentionInput';
import { useDebouncedValue } from '@/shared/hooks/useDebouncedValue';
import { getApiError } from '@/shared/lib/apiError';
import type { Comment } from '@/features/feed/types';
import { useCreateSessionComment } from './hooks/useCreateSessionComment';
import { useDeleteSessionComment } from './hooks/useDeleteSessionComment';
import { useLikeSessionComment } from './hooks/useLikeSessionComment';
import { useSessionComments } from './hooks/useSessionComments';
import { useThreadPeople } from './hooks/useThreadPeople';
import { useUnlikeSessionComment } from './hooks/useUnlikeSessionComment';

/**
 * `SessionCommentSection`'s data boundary — session-scoped equivalent of `useCommentsData`.
 * `isOpen` gates the underlying query the same way (only fetches while the detail modal is
 * actually open). `isForbidden` is the real visibility gate for this feature (CLIENT-SESSION-8,
 * user decision): the client can't reliably tell ahead of time whether the caller is a
 * JOINED/REQUESTED/INVITED participant or group member (that's CLIENT-SESSION-9's
 * `callerParticipation`, not yet built) — a 403 on the comments GET means "not visible," and
 * `SessionCommentSection` renders nothing in that case rather than an error.
 */
export function useSessionCommentsData(sessionId: number | undefined, isOpen: boolean) {
  const commentsQuery = useSessionComments(sessionId, isOpen);
  const createMutation = useCreateSessionComment();
  const deleteMutation = useDeleteSessionComment();
  const likeMutation = useLikeSessionComment();
  const unlikeMutation = useUnlikeSessionComment();

  // CLIENT-GL-50: the people an `@` in a comment or reply offers (SESSION-GL-64). One query shared by both boxes: only one
  // has the caret at a time, and it reports the word after its `@` (`null` = none, the call stays off).
  const [peopleQuery, setPeopleQuery] = useState<string | null>(null);
  const debouncedPeopleQuery = useDebouncedValue(peopleQuery, 150);
  const peopleQueryResult = useThreadPeople(isOpen ? sessionId : undefined, peopleQuery === null ? null : debouncedPeopleQuery);
  const mentionSource = useMemo<MentionSource>(
    () => ({
      options:
        peopleQuery === null
          ? []
          : (peopleQueryResult.data ?? []).map((person) => ({
              id: person.userId,
              name: person.fullName,
              label: person.fullName,
              avatarUrl: person.avatarUrl,
            })),
      onQueryChange: setPeopleQuery,
    }),
    [peopleQuery, peopleQueryResult.data],
  );

  const comments = useMemo(
    () => commentsQuery.data?.pages.flatMap((page) => page.content) ?? [],
    [commentsQuery.data],
  );

  const isForbidden = commentsQuery.isError && getApiError(commentsQuery.error).category === 'FORBIDDEN';

  const addComment = useCallback(
    (content: string) =>
      sessionId !== undefined && createMutation.mutate({ sessionId, payload: { content } }),
    [createMutation, sessionId],
  );

  const addReply = useCallback(
    (parentCommentId: number, content: string) =>
      sessionId !== undefined &&
      createMutation.mutate({ sessionId, payload: { content, parentCommentId } }),
    [createMutation, sessionId],
  );

  const deleteComment = useCallback(
    (comment: Comment) =>
      sessionId !== undefined &&
      deleteMutation.mutate({ sessionId, commentId: comment.id }),
    [deleteMutation, sessionId],
  );

  const toggleCommentLike = useCallback(
    (comment: Comment) => {
      if (sessionId === undefined) return;
      if (comment.isLikedByCurrentUser) {
        unlikeMutation.mutate({ sessionId, commentId: comment.id });
      } else {
        likeMutation.mutate({ sessionId, commentId: comment.id });
      }
    },
    [sessionId, likeMutation, unlikeMutation],
  );

  return {
    comments,
    isCommentsLoading: commentsQuery.isLoading,
    isCommentsError: commentsQuery.isError && !isForbidden,
    isCommentsForbidden: isForbidden,
    hasMoreComments: commentsQuery.hasNextPage ?? false,
    isFetchingMoreComments: commentsQuery.isFetchingNextPage,
    onFetchMoreComments: () => commentsQuery.fetchNextPage(),
    onAddComment: addComment,
    onAddCommentReply: addReply,
    isPostingComment: createMutation.isPending,
    onDeleteComment: deleteComment,
    onToggleCommentLike: toggleCommentLike,
    mentionSource,
  };
}
