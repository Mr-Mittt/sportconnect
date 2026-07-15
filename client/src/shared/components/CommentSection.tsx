import { createElement, useState } from 'react';
import type { Comment, Post } from '@/features/feed/types';
import { MAX_COMMENT_LENGTH } from '@/features/feed/types';
import { getRampBadgeClasses } from '@/shared/lib/rampStyles';
import { formatRelativeTime } from '@/shared/lib/relativeTime';
import { getSportIcon } from '@/shared/lib/sportIcons';
import { cn } from '@/shared/lib/utils';
import type { SportProfile } from '@/shared/types/sport';
import { Avatar, AvatarFallback, AvatarImage } from '@/shared/ui/avatar';
import { Button, POST_BUTTON_DISABLED_OVERRIDE } from '@/shared/ui/button';
import { Dialog, DialogClose, DialogContent, DialogTitle } from '@/shared/ui/dialog';
import { CommentItem } from './CommentItem';

interface CommentSectionProps {
  isOpen: boolean;
  onClose: () => void;
  currentUserId: string | undefined;
  currentUser: { fullName: string; avatarUrl: string | null } | undefined;
  /** The post this thread belongs to — null only transiently (e.g. mid
   * close-animation after HomeFeedPage clears `activeCommentsPostId`).
   * Renders the header/repeated post content shown here, per the design
   * reference (design-reference-post-modal.html) — the post is always
   * visible in-dialog, not left to the dimmed page behind the overlay. */
  post: Post | null;
  sport: SportProfile | null;
  comments: Comment[];
  isLoading: boolean;
  isError: boolean;
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
 * FEED-2's real comment thread — a modal dialog (user decision; no
 * design-reference-*.html covered this surface pre-implementation — one was
 * added retroactively at design-reference/design-reference-post-modal.html)
 * opened from PostCard's comment icon. Presentational and controlled, like
 * every other Home Feed component (client/CLAUDE.md) — all data/mutations
 * come from the parent's `useCommentsData(postId, isOpen)` hook, not
 * fetched here, so this stays Storybook-testable without a TanStack Query
 * provider.
 */
export function CommentSection({
  isOpen,
  onClose,
  currentUserId,
  currentUser,
  post,
  sport,
  comments,
  isLoading,
  isError,
  hasMore,
  isFetchingMore,
  onFetchMore,
  onAddComment,
  onAddReply,
  isPosting,
  onDeleteComment,
  onToggleCommentLike,
}: CommentSectionProps) {
  const [content, setContent] = useState('');

  const submitComment = () => {
    const trimmed = content.trim();
    if (trimmed.length === 0) return;
    onAddComment(trimmed);
    setContent('');
  };

  const displayName = post?.userFullName ?? 'Unknown User';

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogTitle className="sr-only">Comments on {displayName}'s post</DialogTitle>

        {post !== null && (
          <div className="border-hairline-b flex items-center justify-between gap-2 border-border px-4 py-3">
            <div className="flex min-w-0 items-center gap-2.5">
              <Avatar className="size-9 shrink-0">
                {post.userAvatarUrl !== null && <AvatarImage src={post.userAvatarUrl} alt="" />}
                <AvatarFallback className="bg-surface-1 text-text-primary">
                  {initialsFor(displayName)}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <div className="text-sm font-medium text-text-primary">{displayName}</div>
                <div className="text-xs text-text-muted">{formatRelativeTime(post.createdAt)}</div>
              </div>
            </div>
            <div className="flex shrink-0 flex-col items-end justify-center gap-1.5">
              <DialogClose aria-label="Close" />
              {sport !== null && (
                <span
                  className={cn(
                    'flex items-center gap-1 rounded-full px-2 py-0.5 text-2xs',
                    getRampBadgeClasses(sport.colorRamp),
                  )}
                >
                  {createElement(getSportIcon(sport.icon), { className: 'size-3', 'aria-hidden': true })}
                  {sport.label}
                </span>
              )}
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-4 py-3">
          {post !== null && (
            <p className="border-hairline-b mb-3 border-border pb-3 text-sm text-text-primary">
              {post.content}
            </p>
          )}
          {isLoading && <p className="text-2sm text-text-muted">Loading comments…</p>}
          {isError && <p className="text-2sm text-text-danger">Couldn't load comments.</p>}
          {!isLoading && !isError && comments.length === 0 && (
            <p className="text-2sm text-text-muted">No comments yet. Be the first to comment!</p>
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
        </div>

        <div className="border-hairline-t flex items-center gap-2 border-border px-4 py-3">
          <Avatar className="size-8 shrink-0">
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
      </DialogContent>
    </Dialog>
  );
}
