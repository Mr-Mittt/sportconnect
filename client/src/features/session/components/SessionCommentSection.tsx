import type { Comment } from '@/features/feed/types';
import { CommentItem } from '@/shared/components/CommentItem';
import { useOverridableText } from '@/shared/lib/useOverridableText';

interface SessionCommentSectionProps {
  /** i18next `"namespace:key.path"` prefix that overrides this component's copy (see `useOverridableText`). */
  i18nOverridePrefix?: string;
  currentUserId: string | undefined;
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
  onAddReply: (parentCommentId: number, content: string) => void;
  isPosting: boolean;
  onDeleteComment: (comment: Comment) => void;
  onToggleCommentLike: (comment: Comment) => void;
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
 *
 * CLIENT-SESSION-10: no longer owns the comment composer — `SessionDetailModal` renders
 * `SessionCommentComposer` separately in its pinned footer (design-reference-session-modal.html).
 * Post-ship: no longer owns the session-like button either — `SessionDetailModal` renders it as a
 * sibling directly above this section's own hairline-top border (was previously the first thing
 * inside it, below that border) — same `isCommentsForbidden` gate keeps it hidden together with
 * the rest of the Discussion content. This component is now just the thread + "view more".
 */
export function SessionCommentSection({
  currentUserId,
  comments,
  isLoading,
  isError,
  isForbidden,
  hasMore,
  isFetchingMore,
  onFetchMore,
  onAddReply,
  isPosting,
  onDeleteComment,
  onToggleCommentLike,
  i18nOverridePrefix,
}: SessionCommentSectionProps) {
  const t = useOverridableText('session', i18nOverridePrefix);
  if (isForbidden) return null;

  return (
    <section aria-label={t('comments.title')} className="border-hairline-t flex flex-col gap-2 border-border pt-3">
      {isLoading && <p className="text-2xs text-text-muted">{t('comments.loading')}</p>}
      {isError && (
        <p role="alert" className="text-2xs text-text-danger">
          {t('comments.error')}
        </p>
      )}
      {!isLoading && !isError && comments.length === 0 && (
        <p className="text-2xs text-text-muted">{t('comments.empty')}</p>
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
              {isFetchingMore ? t('common.loading') : t('comments.viewMore')}
            </button>
          )}
        </div>
      )}
    </section>
  );
}
