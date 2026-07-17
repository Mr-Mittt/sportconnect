import type { GroupRef, Post } from '@/features/feed/types';
import { SPORT_ID_BY_KEY, sportKeyForId } from '@/features/feed/sportIdMap';
import { useInfiniteScrollSentinel } from '@/shared/lib/useInfiniteScrollSentinel';
import { Skeleton } from '@/shared/ui/skeleton';
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
  /** FEED-8: retries the initial load — the retry action behind the
   * error state below. Only called while `isError` is true. */
  onRetry: () => void;
  /** FEED-8: true when a "load more" attempt (not the initial load) failed —
   * already-loaded posts stay visible; only the load-more control switches
   * to an error+retry state. */
  isLoadMoreError: boolean;
  /** Shown when `visiblePosts` is empty. Defaults to Home Feed/Groups'
   * per-sport wording — `HashtagPostsModal` (FEED-6) overrides it for its
   * per-tag empty state. */
  emptyMessage?: string;
  /** Default `true` (Home Feed/HashtagPostsModal, which blend posts from
   * multiple sports — the badge disambiguates which sport a post is about).
   * The Groups page passes `activeSport === 'all'`: with a specific sport
   * selected, every visible post already shares it (Feed's own filter below
   * guarantees that), so the badge is redundant. With "All" sports, posts
   * can span multiple groups/sports again, so the badge stays useful. */
  showSportBadge?: boolean;
  /** post.groupId -> { groupName, sportId }, for resolving each GROUP_POST/
   * GROUP_BROADCAST's "username > groupname" author line. Missing/unmapped
   * ids render just the username — see PostCard's own doc comment. */
  groupsById?: Record<number, GroupRef>;
  /** Default `true` (Home Feed, which always blends posts from multiple
   * groups). The Groups page passes `selectedGroupId === null`: inside one
   * specific group's own feed every post already shares that one group, so
   * repeating its name on every card is redundant, same reasoning as
   * `showSportBadge`. */
  showGroupName?: boolean;
  /** Called with (groupId, sportId) when a post's group name is clicked.
   * Optional — `HashtagPostsModal` doesn't wire this up (it has no
   * group-scoped destination to send the user to), so the group name there
   * just renders as static text via PostCard's own no-op fallback. */
  onGroupClick?: (groupId: number, sportId: number) => void;
}

function PostCardSkeleton() {
  return (
    <div className="border-hairline flex flex-col gap-3 rounded-xl border-border bg-surface-2 p-3.5">
      <div className="flex items-center gap-2.5">
        <Skeleton className="size-9 rounded-full" />
        <div className="flex flex-col gap-1.5">
          <Skeleton className="h-3 w-28" />
          <Skeleton className="h-2.5 w-16" />
        </div>
      </div>
      <Skeleton className="h-3 w-full" />
      <Skeleton className="h-3 w-2/3" />
    </div>
  );
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
 *
 * FEED-8: `isLoading` renders 3 post-card skeletons; `isError` (the initial
 * load failed) renders a retry block instead of the post list. `isLoadMoreError`
 * is a separate, narrower case — a failed "load more" leaves the already-loaded
 * posts on screen and only swaps the load-more control for its own retry
 * affordance, so one failed page fetch doesn't blank out everything already
 * shown.
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
  onRetry,
  isLoadMoreError,
  emptyMessage = 'No posts yet for this sport.',
  showSportBadge = true,
  groupsById = {},
  showGroupName = true,
  onGroupClick,
}: FeedProps) {
  const canLoadMore = hasMorePosts && !isFetchingMorePosts;
  const sentinelRef = useInfiniteScrollSentinel(onLoadMore, canLoadMore);

  if (isLoading) {
    return (
      <div className="flex flex-col gap-2.5">
        <PostCardSkeleton />
        <PostCardSkeleton />
        <PostCardSkeleton />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="border-hairline flex flex-col items-center gap-2 rounded-xl border-border bg-surface-2 p-6 text-center">
        <p className="text-2sm text-text-danger">Couldn't load posts.</p>
        <button
          type="button"
          onClick={onRetry}
          className="cursor-pointer rounded-lg border-hairline border-border px-3 py-1.5 text-2sm font-medium text-text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-accent"
        >
          Retry
        </button>
      </div>
    );
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
        const groupId = post.groupId;
        const group = showGroupName && groupId !== null ? (groupsById[groupId] ?? null) : null;
        return (
          <PostCard
            key={post.id}
            post={post}
            sport={showSportBadge ? (sport ?? null) : null}
            currentUserId={currentUserId}
            groupName={group?.groupName ?? null}
            onGroupClick={
              group !== null && groupId !== null && onGroupClick !== undefined
                ? () => onGroupClick(groupId, group.sportId)
                : undefined
            }
            onToggleLike={onToggleLike}
            onHashtagClick={onHashtagClick}
            onDeletePost={onDeletePost}
            onOpenComments={onOpenComments}
          />
        );
      })}

      <div ref={sentinelRef} aria-hidden="true" />
      {hasMorePosts && isLoadMoreError && (
        <div className="flex flex-col items-center gap-1.5 self-center">
          <p className="text-2sm text-text-danger">Couldn't load more posts.</p>
          <button
            type="button"
            onClick={onLoadMore}
            className="cursor-pointer rounded-lg border-hairline border-border px-4 py-2 text-2sm font-medium text-text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-accent"
          >
            Retry
          </button>
        </div>
      )}
      {hasMorePosts && !isLoadMoreError && (
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
