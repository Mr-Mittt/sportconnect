import { IconHeart, IconHeartFilled } from '@tabler/icons-react';
import { useState } from 'react';
import type { Comment } from '@/features/feed/types';
import { MAX_COMMENT_LENGTH } from '@/features/feed/types';
import { CommentItem } from '@/shared/components/CommentItem';
import { cn } from '@/shared/lib/utils';
import { Avatar, AvatarFallback, AvatarImage } from '@/shared/ui/avatar';
import { Button, POST_BUTTON_DISABLED_OVERRIDE } from '@/shared/ui/button';

interface SessionCommentSectionProps {
  currentUserId: string | undefined;
  currentUser: { fullName: string; avatarUrl: string | null } | undefined;
  /** Like state of the session itself (its SESSION_POST anchor) — rendered here, directly above
   * the comment thread, same placement as Post's own `CommentSection` (like button sits right
   * under the repeated post content, before the comments list). */
  likeCount: number;
  isLikedByCurrentUser: boolean;
  onToggleLike: () => void;
  isTogglingLike: boolean;
  comments: Comment[];
  isLoading: boolean;
  isError: boolean;
  /** SESSION-10 gates this thread to JOINED/REQUESTED/INVITED participants (or a group member
   * for a group-linked session); the client can't reliably tell that ahead of time (no
   * `callerParticipation` yet — CLIENT-SESSION-9), so a 403 on the comments fetch is read as
   * "not visible" and this whole section renders nothing, rather than an error message. */
  isForbidden: boolean;
  hasMore: boolean;
  isFetchingMore: boolean;
  onFetchMore: () => void;
  onAddComment: (content: string) => void;
  onAddReply: (parentCommentId: number, content: string) => void;
  isPosting: boolean;
  onDeleteComment: (comment: Comment) => void;
  onToggleCommentLike: (comment: Comment) => void;
}

function initialsFor(fullName: string): string {
  return fullName
    .split(' ')
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

/**
 * CLIENT-SESSION-8's discussion section — an inline block rendered directly inside
 * `SessionDetailModal`'s own scrollable content, not a nested Dialog (this codebase's
 * `SessionDetailModal` is already a Dialog, and stacking two broke earlier
 * `CreateSessionModal` attempts — see `useDiscoverModalData`'s notes on the same constraint).
 * Reuses `CommentItem` (one-level reply nesting, per-comment likes) without the hashtag-click
 * wiring Post's `CommentSection` gives it — session comments render as plain text, no linking
 * destination exists here. No visible "Discussion" heading — mirrors Post's own `CommentSection`,
 * which has no "Comments" label either, just the like button then the thread directly. `aria-label`
 * on the wrapping `<section>` still names the region for assistive tech/tests, without a visible
 * on-screen label.
 */
export function SessionCommentSection({
  currentUserId,
  currentUser,
  likeCount,
  isLikedByCurrentUser,
  onToggleLike,
  isTogglingLike,
  comments,
  isLoading,
  isError,
  isForbidden,
  hasMore,
  isFetchingMore,
  onFetchMore,
  onAddComment,
  onAddReply,
  isPosting,
  onDeleteComment,
  onToggleCommentLike,
}: SessionCommentSectionProps) {
  const [content, setContent] = useState('');

  if (isForbidden) return null;

  const submitComment = () => {
    const trimmed = content.trim();
    if (trimmed.length === 0) return;
    onAddComment(trimmed);
    setContent('');
  };

  return (
    <section aria-label="Discussion" className="border-hairline-t flex flex-col gap-2 border-border pt-3">
      <button
        type="button"
        aria-pressed={isLikedByCurrentUser}
        aria-label={isLikedByCurrentUser ? 'Unlike' : 'Like'}
        onClick={onToggleLike}
        disabled={isTogglingLike}
        className={cn(
          'flex w-fit cursor-pointer items-center gap-1 rounded p-0.5 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-accent disabled:cursor-default',
          isLikedByCurrentUser ? 'text-text-danger' : 'text-text-secondary',
        )}
      >
        {isLikedByCurrentUser ? (
          <IconHeartFilled className="size-4" aria-hidden="true" />
        ) : (
          <IconHeart className="size-4" aria-hidden="true" />
        )}
        {likeCount}
      </button>

      {isLoading && <p className="text-2xs text-text-muted">Loading comments…</p>}
      {isError && (
        <p role="alert" className="text-2xs text-text-danger">
          Couldn't load comments.
        </p>
      )}
      {!isLoading && !isError && comments.length === 0 && (
        <p className="text-2xs text-text-muted">No comments yet. Be the first to comment!</p>
      )}
      {!isLoading && !isError && comments.length > 0 && (
        <div className="flex flex-col gap-3">
          {comments.map((comment) => (
            <CommentItem
              key={comment.id}
              comment={comment}
              currentUserId={currentUserId}
              onToggleLike={onToggleCommentLike}
              onDelete={onDeleteComment}
              onReply={onAddReply}
              isSubmittingReply={isPosting}
            />
          ))}
          {hasMore && (
            <button
              type="button"
              onClick={onFetchMore}
              disabled={isFetchingMore}
              className="cursor-pointer self-center rounded-lg border-hairline border-border px-3 py-1.5 text-2xs font-medium text-text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-accent disabled:cursor-default disabled:opacity-60"
            >
              {isFetchingMore ? 'Loading…' : 'View more comments'}
            </button>
          )}
        </div>
      )}

      <div className="flex items-center gap-2 pt-1">
        <Avatar className="size-7 shrink-0">
          {currentUser?.avatarUrl != null && <AvatarImage src={currentUser.avatarUrl} alt="" />}
          <AvatarFallback className="bg-surface-1 text-2xs text-text-primary">
            {currentUser !== undefined ? initialsFor(currentUser.fullName) : ''}
          </AvatarFallback>
        </Avatar>
        <input
          type="text"
          value={content}
          onChange={(event) => setContent(event.target.value.slice(0, MAX_COMMENT_LENGTH))}
          onKeyDown={(event) => {
            if (event.key === 'Enter') submitComment();
          }}
          placeholder="Add a comment…"
          aria-label="Add a comment"
          maxLength={MAX_COMMENT_LENGTH}
          className="min-w-0 flex-1 rounded-lg border-hairline border-border bg-surface-1 px-3 py-1.5 text-2sm text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-accent"
        />
        <Button
          variant="primary"
          size="sm"
          onClick={submitComment}
          disabled={content.trim().length === 0 || isPosting}
          className={cn('cursor-pointer disabled:cursor-default', POST_BUTTON_DISABLED_OVERRIDE)}
        >
          Post
        </Button>
      </div>
    </section>
  );
}
