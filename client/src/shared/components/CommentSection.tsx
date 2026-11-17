import { IconHeart, IconHeartFilled, IconSend } from '@tabler/icons-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Comment, Post } from '@/features/feed/types';
import { MAX_COMMENT_LENGTH } from '@/features/feed/types';
import { isEmptyDraft, serialize, trimSegments } from '@/shared/lib/mentionMarkup';
import { getRampBadgeClasses } from '@/shared/lib/rampStyles';
import { formatFullDateTime, formatTimestamp } from '@/shared/lib/timestamp';
import { useOverridableText } from '@/shared/lib/useOverridableText';
import { cn } from '@/shared/lib/utils';
import type { SportProfile } from '@/shared/types/sport';
import { Avatar, AvatarFallback, AvatarImage } from '@/shared/ui/avatar';
import { Button, POST_BUTTON_DISABLED_OVERRIDE } from '@/shared/ui/button';
import { useCloseWithDraftGuard, useDraftRegistry } from '@/shared/hooks/useCloseWithDraftGuard';
import { Dialog, DialogClose, DialogContent, DialogTitle } from '@/shared/ui/dialog';
import { focusFirstUnsent } from '@/shared/lib/focusFirstUnsent';
import { UnsavedPostConfirmDialog } from './UnsavedPostConfirmDialog';
import { Skeleton } from '@/shared/ui/skeleton';
import { CommentItem } from './CommentItem';
import { MentionInput, type MentionDraft, type MentionInputHandle, type MentionSource } from './MentionInput';
import { PostText } from './PostText';
import { SportIcon } from './SportIcon';
import { EmptyHint } from '@/shared/components/EmptyHint';

interface CommentSectionProps {
  isOpen: boolean;
  onClose: () => void;
  currentUserId: string | undefined;
  currentUser: { fullName: string; avatarUrl: string | null } | undefined;
  /** The post this thread belongs to — null while still loading/erroring
   * (FEED-12: `usePost` may genuinely be mid-fetch or have failed, not just
   * mid close-animation as before — see `isPostLoading`/`isPostError`), or
   * transiently mid close-animation after the owning page clears its active
   * post id. Renders the header/repeated post content shown here, per the
   * design reference (design-reference-post-modal.html) — the post is always
   * visible in-dialog, not left to the dimmed page behind the overlay. */
  post: Post | null;
  sport: SportProfile | null;
  /** FEED-12: `usePost`'s own loading/error state — distinct from
   * `isLoading`/`isError` above, which are the comment thread's. A cold
   * `/posts/:id` load can have the post itself still fetching (or 404ing)
   * independent of whether comments have loaded. */
  isPostLoading: boolean;
  isPostError: boolean;
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
  /** Hashtags in the repeated post content and in comment bodies are
   * clickable here too (FEED-6 follow-up), same convention as PostCard's
   * `onHashtagClick('#tag')`. */
  onHashtagClick: (tag: string) => void;
  /** Liking the post itself from inside the dialog (found missing during
   * FEED-6's follow-up work — the repeated post content had no like
   * affordance at all, unlike PostCard in the feed). Same
   * `onToggleLike(postId)` convention as PostCard/Feed. */
  onTogglePostLike: (postId: number) => void;
  /** CLIENT-GL-50 part 2: who an `@` in a comment or a reply can tag, the same people as the post itself (a user post:
   * the caller's friends, a group post: the group's members). Absent = nobody can be tagged. */
  mentionSource?: MentionSource;
  /** CLIENT-I18N-4: i18next `"namespace:key.path"` prefix overriding this component's default
   * copy (`sharedComponents.commentSection.*`) for a specific caller. No current caller passes
   * this. */
  i18nOverridePrefix?: string;
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
 * provider. The repeated post content also gets its own like button
 * (`onTogglePostLike`) — the dialog previously had no way to like the post
 * itself, only view/add comments.
 */
export function CommentSection({
  isOpen,
  onClose,
  currentUserId,
  currentUser,
  post,
  sport,
  isPostLoading,
  isPostError,
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
  onHashtagClick,
  onTogglePostLike,
  mentionSource,
  i18nOverridePrefix,
}: CommentSectionProps) {
  const t = useOverridableText('sharedComponents', i18nOverridePrefix);
  const [draft, setDraft] = useState<MentionDraft>({ segments: [], stored: '', plain: '' });
  const [query, setQuery] = useState<string | null>(null);
  const inputHandle = useRef<MentionInputHandle>(null);

  // A person already tagged in this comment is not offered again.
  const options = useMemo(() => {
    if (query === null) return [];
    const tagged = new Set(draft.segments.flatMap((segment) => (segment.kind === 'mention' ? [segment.userId] : [])));
    return (mentionSource?.options ?? []).filter((person) => !tagged.has(person.id));
  }, [query, draft.segments, mentionSource?.options]);

  const isDraftEmpty = isEmptyDraft(draft.segments);

  // Closing over an unsent comment or reply asks first (owner, 2026-11-16).
  const drafts = useDraftRegistry();
  const reportDraft = drafts.report;
  useEffect(() => {
    reportDraft('comment', !isDraftEmpty);
  }, [reportDraft, isDraftEmpty]);
  const closeGuard = useCloseWithDraftGuard(drafts.hasDraft, () => {
    // The box is gone with the closed dialog, so what it held is too.
    setDraft({ segments: [], stored: '', plain: '' });
    setQuery(null);
    onClose();
  });

  const submitComment = () => {
    if (isDraftEmpty) return;
    onAddComment(serialize(trimSegments(draft.segments)));
    inputHandle.current?.clear();
  };

  const displayName = post?.userFullName ?? t('commentSection.unknownUser');

  return (
    <>
    <Dialog open={isOpen} onOpenChange={(open) => !open && closeGuard.requestClose()}>
      <DialogContent
        fixedHeight
        fixedHeightVh={72}
        className="max-w-[35rem]"
        data-unsent-scope="comment-modal"
        // The caret goes to the comment box, not to the first button (owner, 2026-11-16).
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          inputHandle.current?.focus();
        }}
      >
        <DialogTitle className="sr-only">
          {t('commentSection.dialogTitle', { name: displayName })}
        </DialogTitle>

        {/* FEED-12: the post header (below) only ever renders once `post` is
         * resolved. A cold `/posts/:id` load can spend real time (or fail)
         * before that — this block covers that window; the normal
         * close-animation case is a single render tick, over before either
         * `isPostLoading`/`isPostError` would be true, so it never flashes
         * here in practice. Its own DialogClose is needed since the real
         * header (which normally carries one) doesn't render yet either. */}
        {post === null && isPostLoading && (
          <div className="border-hairline-b flex items-center justify-between gap-2 border-border px-4 py-3">
            <div className="flex min-w-0 items-center gap-2.5">
              <Skeleton className="size-9 shrink-0 rounded-full" />
              <div className="flex flex-col gap-1.5">
                <Skeleton className="h-3 w-28" />
                <Skeleton className="h-2.5 w-16" />
              </div>
            </div>
            <DialogClose aria-label={t('commentSection.close')} />
          </div>
        )}
        {post === null && isPostError && (
          <div className="border-hairline-b flex items-center justify-between gap-2 border-border px-4 py-3">
            <p className="text-2sm text-text-danger">{t('commentSection.postLoadError')}</p>
            <DialogClose aria-label={t('commentSection.close')} />
          </div>
        )}

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
                <div className="text-xs text-text-muted" title={formatFullDateTime(post.createdAt)}>
                  {formatTimestamp(post.createdAt)}
                </div>
              </div>
            </div>
            <div className="flex shrink-0 flex-col items-end justify-center gap-1.5">
              <DialogClose aria-label={t('commentSection.close')} />
              {sport !== null && (
                <span
                  className={cn(
                    'flex items-center gap-1 rounded-full px-2 py-0.5 text-2xs',
                    getRampBadgeClasses(sport.colorRamp),
                  )}
                >
                  <SportIcon iconUrl={sport.iconUrl} className="size-3" />
                  {sport.label}
                </span>
              )}
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-4 py-3">
          {post !== null && (
            <div className="border-hairline-b mb-3 border-border pb-3">
              <PostText
                text={post.content}
                onHashtagClick={onHashtagClick}
                className="text-sm text-text-primary"
              />
              <button
                type="button"
                aria-pressed={post.isLikedByCurrentUser}
                aria-label={
                  post.isLikedByCurrentUser ? t('commentSection.unlike') : t('commentSection.like')
                }
                onClick={() => onTogglePostLike(post.id)}
                className={cn(
                  'mt-2 flex cursor-pointer items-center gap-1 rounded p-0.5 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-accent',
                  post.isLikedByCurrentUser ? 'text-text-danger' : 'text-text-secondary',
                )}
              >
                {post.isLikedByCurrentUser ? (
                  <IconHeartFilled className="size-4" aria-hidden="true" />
                ) : (
                  <IconHeart className="size-4" aria-hidden="true" />
                )}
                {post.likeCount}
              </button>
            </div>
          )}
          {/* The composer is the first thing of the thread (owner, 2026-11-14), not pinned at the bottom. */}
          <div className="mb-3 flex items-center gap-2">
            <Avatar className="size-8 shrink-0">
              {currentUser?.avatarUrl != null && <AvatarImage src={currentUser.avatarUrl} alt="" />}
              <AvatarFallback className="bg-surface-1 text-2xs text-text-primary">
                {currentUser !== undefined ? initialsFor(currentUser.fullName) : ''}
              </AvatarFallback>
            </Avatar>
            <MentionInput
              ref={inputHandle}
              ariaLabel={t('commentSection.commentAriaLabel')}
              placeholder={t('commentSection.commentPlaceholder')}
              maxLength={MAX_COMMENT_LENGTH}
              options={options}
              pickerLabel={t('commentSection.mentionLabel')}
              onQueryChange={(next) => {
                setQuery(next);
                mentionSource?.onQueryChange(next);
              }}
              onChange={setDraft}
              onSubmit={submitComment}
            />
            <Button
              variant="primary"
              size="icon"
              aria-label={t('commentSection.postComment')}
              onClick={submitComment}
              disabled={isDraftEmpty || isPosting}
              className={cn(
                'cursor-pointer rounded-full disabled:cursor-default',
                POST_BUTTON_DISABLED_OVERRIDE,
              )}
            >
              <IconSend className="size-4" aria-hidden="true" />
            </Button>
          </div>
          {isLoading && <p className="text-2sm text-text-muted">{t('commentSection.loading')}</p>}
          {isError && <p className="text-2sm text-text-danger">{t('commentSection.loadError')}</p>}
          {!isLoading && !isError && comments.length === 0 && (
            <EmptyHint>{t('commentSection.empty')}</EmptyHint>
          )}
          {!isLoading && !isError && comments.length > 0 && (
            <div className="flex flex-col gap-3">
              {comments.map((comment) => (
                <CommentItem
                  onDraftChange={drafts.report}
                  key={comment.id}
                  comment={comment}
                  currentUserId={currentUserId}
                  currentUser={currentUser}
                  onToggleLike={onToggleCommentLike}
                  onDelete={onDeleteComment}
                  onReply={onAddReply}
                  isSubmittingReply={isPosting}
                  onHashtagClick={onHashtagClick}
                  mentionSource={mentionSource}
                />
              ))}
              {hasMore && (
                <button
                  type="button"
                  onClick={onFetchMore}
                  disabled={isFetchingMore}
                  className="cursor-pointer self-center rounded-lg border-hairline border-border px-3 py-1.5 text-2xs font-medium text-text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-accent disabled:cursor-default disabled:opacity-60"
                >
                  {isFetchingMore ? t('commentSection.loadingMore') : t('commentSection.viewMore')}
                </button>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
    <UnsavedPostConfirmDialog
      isOpen={closeGuard.isAsking}
      onStay={closeGuard.stay}
      onLeave={closeGuard.leave}
      onStayFocus={() => focusFirstUnsent('[data-unsent-scope="comment-modal"]')}
      i18nOverridePrefix="sharedDialogs:unsavedComment"
    />
    </>
  );
}
