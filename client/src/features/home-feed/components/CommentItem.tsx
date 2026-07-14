import { IconHeart, IconHeartFilled, IconTrash } from '@tabler/icons-react';
import { useState } from 'react';
import { MAX_COMMENT_LENGTH, type Comment } from '@/features/feed/types';
import { formatRelativeTime } from '@/shared/lib/relativeTime';
import { cn } from '@/shared/lib/utils';
import { Avatar, AvatarFallback, AvatarImage } from '@/shared/ui/avatar';
import { Button, POST_BUTTON_DISABLED_OVERRIDE } from '@/shared/ui/button';

interface CommentItemProps {
  comment: Comment;
  currentUserId: string | undefined;
  onToggleLike: (comment: Comment) => void;
  onDelete: (comment: Comment) => void;
  onReply: (parentCommentId: number, content: string) => void;
  isSubmittingReply: boolean;
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
 * A single comment or reply row, recursive for one level of nesting
 * (`comment.replies` — the backend guarantees a reply is never itself
 * replied to, per A4, so this never recurses past depth 2). "Reply" only
 * renders for root comments (`comment.parentCommentId === null`) — matching
 * that same server-side constraint rather than relying on a caller-supplied
 * flag.
 */
export function CommentItem({
  comment,
  currentUserId,
  onToggleLike,
  onDelete,
  onReply,
  isSubmittingReply,
}: CommentItemProps) {
  const [showReplyBox, setShowReplyBox] = useState(false);
  const [replyContent, setReplyContent] = useState('');

  const isOwnComment = currentUserId !== undefined && comment.userId === currentUserId;
  const canReply = comment.parentCommentId === null;

  const submitReply = () => {
    const trimmed = replyContent.trim();
    if (trimmed.length === 0) return;
    onReply(comment.id, trimmed);
    setReplyContent('');
    setShowReplyBox(false);
  };

  return (
    <div>
      <div className="flex items-start gap-2">
        <Avatar className="size-7 shrink-0">
          {comment.userAvatarUrl !== null && <AvatarImage src={comment.userAvatarUrl} alt="" />}
          <AvatarFallback className="bg-surface-1 text-2xs text-text-primary">
            {initialsFor(comment.userFullName)}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <div className="rounded-lg bg-surface-1 px-2.5 py-1.5">
            <div className="flex items-center gap-1.5">
              <span className="text-2sm font-medium text-text-primary">{comment.userFullName}</span>
              <span className="text-2xs text-text-muted">{formatRelativeTime(comment.createdAt)}</span>
            </div>
            <p className="text-2sm text-text-primary">{comment.content}</p>
          </div>
          <div className="mt-1 flex items-center gap-3 px-1">
            <button
              type="button"
              aria-pressed={comment.isLikedByCurrentUser}
              aria-label={comment.isLikedByCurrentUser ? 'Unlike comment' : 'Like comment'}
              onClick={() => onToggleLike(comment)}
              className={cn(
                'flex cursor-pointer items-center gap-1 rounded p-0.5 text-2xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-accent',
                comment.isLikedByCurrentUser ? 'text-text-danger' : 'text-text-secondary',
              )}
            >
              {comment.isLikedByCurrentUser ? (
                <IconHeartFilled className="size-3.5" aria-hidden="true" />
              ) : (
                <IconHeart className="size-3.5" aria-hidden="true" />
              )}
              {comment.likeCount}
            </button>
            {canReply && (
              <button
                type="button"
                onClick={() => setShowReplyBox((open) => !open)}
                className="cursor-pointer rounded p-0.5 text-2xs font-medium text-text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-accent"
              >
                Reply
              </button>
            )}
            {isOwnComment && (
              <button
                type="button"
                aria-label="Delete comment"
                onClick={() => onDelete(comment)}
                className="ml-auto cursor-pointer rounded p-0.5 text-text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-accent"
              >
                <IconTrash className="size-3.5" aria-hidden="true" />
              </button>
            )}
          </div>

          {showReplyBox && (
            <div className="mt-1.5 flex items-center gap-1.5">
              <input
                type="text"
                value={replyContent}
                onChange={(event) => setReplyContent(event.target.value.slice(0, MAX_COMMENT_LENGTH))}
                placeholder={`Reply to ${comment.userFullName}`}
                aria-label={`Reply to ${comment.userFullName}`}
                maxLength={MAX_COMMENT_LENGTH}
                className="min-w-0 flex-1 rounded-lg border-hairline border-border bg-surface-2 px-2.5 py-1 text-2sm text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-accent"
              />
              <Button
                variant="primary"
                size="sm"
                onClick={submitReply}
                disabled={replyContent.trim().length === 0 || isSubmittingReply}
                className={cn('cursor-pointer text-2xs disabled:cursor-default', POST_BUTTON_DISABLED_OVERRIDE)}
              >
                Post
              </Button>
            </div>
          )}

          {comment.replies.length > 0 && (
            <div className="mt-2 flex flex-col gap-2 pl-3">
              {comment.replies.map((reply) => (
                <CommentItem
                  key={reply.id}
                  comment={reply}
                  currentUserId={currentUserId}
                  onToggleLike={onToggleLike}
                  onDelete={onDelete}
                  onReply={onReply}
                  isSubmittingReply={isSubmittingReply}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
