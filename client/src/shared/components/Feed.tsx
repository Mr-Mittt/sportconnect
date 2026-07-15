import type { Post } from '@/features/feed/types';
import { SPORT_ID_BY_KEY, sportKeyForId } from '@/features/feed/sportIdMap';
import { useInfiniteScrollSentinel } from '@/shared/lib/useInfiniteScrollSentinel';
import type { SportKey, SportProfile } from '@/shared/types/sport';
import { PostCard } from './PostCard';

interface FeedProps {
  posts: Post[];
  activeSport: SportKey | 'all';
  sportsByKey: Record<SportKey, SportProfile>;
  currentUserId: string | undefined;
  onToggleLike: (postId: number) => void;
  onHashtagClick: (tag: string) => void;
  onDeletePost: (postId: number) => void;
  onOpenComments: (postId: number) => void;
  hasMorePosts: boolean;
  isFetchingMorePosts: boolean;
  onLoadMore: () => void;
  isLoading: boolean;
  isError: boolean;
  /** Shown when `visiblePosts` is empty. Defaults to Home Feed/Groups'
   * per-sport wording — `HashtagPostsModal` (FEED-6) overrides it for its
   * per-tag empty state. */
  emptyMessage?: string;
}

/**
 * Real (FEED-1) post list — filters by `activeSport` via the temporary
 * `sportIdMap` (post.sportId, not a mock `sport` field), resolves each
 * post's badge the same way, and drives pagination via
 * `useInfiniteScrollSentinel` plus an always-rendered "Load more" button
 * (the keyboard/screen-reader-reachable fallback trigger scroll alone can't
 * provide). Presentational/controlled per client/CLAUDE.md — all state
 * (posts, pagination, loading/error) comes from the parent's
 * `useHomeFeedData()` hook.
 */
export function Feed({
  posts,
  activeSport,
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
  emptyMessage = 'No posts yet for this sport.',
}: FeedProps) {
  const canLoadMore = hasMorePosts && !isFetchingMorePosts;
  const sentinelRef = useInfiniteScrollSentinel(onLoadMore, canLoadMore);

  // FEED-8 owns loading/error UI (skeletons, retry affordance) — leaving
  // these unrendered here rather than the wrong "no posts" empty message,
  // same "hardcoded false and unrendered" precedent HF-7 established.
  if (isLoading || isError) {
    return null;
  }

  const visiblePosts =
    activeSport === 'all'
      ? posts
      : posts.filter((post) => post.sportId === SPORT_ID_BY_KEY[activeSport]);

  if (visiblePosts.length === 0) {
    return <div className="py-6 text-center text-2sm text-text-muted">{emptyMessage}</div>;
  }

  return (
    <div className="flex flex-col gap-2.5">
      {visiblePosts.map((post) => {
        const sportKey = sportKeyForId(post.sportId);
        const sport = sportKey !== undefined ? sportsByKey[sportKey] : null;
        return (
          <PostCard
            key={post.id}
            post={post}
            sport={sport ?? null}
            currentUserId={currentUserId}
            onToggleLike={onToggleLike}
            onHashtagClick={onHashtagClick}
            onDeletePost={onDeletePost}
            onOpenComments={onOpenComments}
          />
        );
      })}

      <div ref={sentinelRef} aria-hidden="true" />
      {hasMorePosts && (
        <button
          type="button"
          onClick={onLoadMore}
          disabled={isFetchingMorePosts}
          className="cursor-pointer self-center rounded-lg border-hairline border-border px-4 py-2 text-2sm font-medium text-text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-accent disabled:cursor-default disabled:opacity-60"
        >
          {isFetchingMorePosts ? 'Loading…' : 'Load more'}
        </button>
      )}
    </div>
  );
}
