import type { Post } from '@/features/feed/types';
import { useOverridableText } from '@/shared/lib/useOverridableText';
import type { SportKey, SportProfile } from '@/shared/types/sport';
import { Dialog, DialogContent, DialogHeader } from '@/shared/ui/dialog';
import { Feed } from './Feed';

interface HashtagPostsModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** e.g. '#fridayrun'; null only transiently (e.g. mid close-animation
   * after the owning page clears its active-hashtag state). */
  tag: string | null;
  posts: Post[];
  sportsByKey: Record<SportKey, SportProfile>;
  currentUserId: string | undefined;
  onToggleLike: (postId: number) => void;
  /** Clicking a different hashtag inside a result post re-targets this same
   * modal to that tag, rather than opening a second one. */
  onHashtagClick: (tag: string) => void;
  onDeletePost: (postId: number) => void;
  onOpenComments: (postId: number) => void;
  hasMorePosts: boolean;
  isFetchingMorePosts: boolean;
  onLoadMore: () => void;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
  isLoadMoreError: boolean;
  /** CLIENT-I18N-4: i18next `"namespace:key.path"` prefix overriding this component's default
   * copy (`sharedComponents.hashtagPostsModal.*`) for a specific caller. No current caller passes
   * this. */
  i18nOverridePrefix?: string;
}

/**
 * FEED-6's hashtag-results destination — a modal (user decision; no
 * design-reference-*.html covers this surface, same situation FEED-2 hit for
 * its comment modal), not a route. Presentational and controlled, like
 * `CommentSection`: all data/mutations come from the parent's
 * `useHashtagResultsData(tag, isOpen)` hook, not fetched here, so this stays
 * Storybook-testable without a TanStack Query provider.
 *
 * Reuses `Feed` directly for the post list — pagination, loading/error/retry
 * (FEED-8), and empty state are already solved there; this only supplies
 * `activeSport="all"` (hashtag results aren't sport-scoped) and a tag-specific
 * `emptyMessage`.
 */
export function HashtagPostsModal({
  isOpen,
  onClose,
  tag,
  posts,
  sportsByKey,
  currentUserId,
  onToggleLike,
  onHashtagClick,
  onDeletePost,
  onOpenComments,
  hasMorePosts,
  isFetchingMorePosts,
  onLoadMore,
  isLoading,
  isError,
  onRetry,
  isLoadMoreError,
  i18nOverridePrefix,
}: HashtagPostsModalProps) {
  const t = useOverridableText('sharedComponents', i18nOverridePrefix);
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader
          title={tag ?? t('hashtagPostsModal.fallbackTitle')}
          className="border-hairline-b border-border px-4 py-3"
        />

        <div className="flex-1 overflow-y-auto px-4 py-3">
          <Feed
            posts={posts}
            activeSport="all"
            sportsByKey={sportsByKey}
            currentUserId={currentUserId}
            onToggleLike={onToggleLike}
            onHashtagClick={onHashtagClick}
            onDeletePost={onDeletePost}
            onOpenComments={onOpenComments}
            hasMorePosts={hasMorePosts}
            isFetchingMorePosts={isFetchingMorePosts}
            onLoadMore={onLoadMore}
            isLoading={isLoading}
            isError={isError}
            onRetry={onRetry}
            isLoadMoreError={isLoadMoreError}
            emptyMessage={t('hashtagPostsModal.emptyMessage', {
              tag: tag ?? t('hashtagPostsModal.emptyMessageFallbackTag'),
            })}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
