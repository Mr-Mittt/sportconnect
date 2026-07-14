import { useMemo, useState } from 'react';
import { useAuthStore } from '@/app/authStore';
import { sportKeyForId } from '@/features/feed/sportIdMap';
import { SportSwitcher } from '@/shared/components/SportSwitcher';
import type { SportKey, SportProfile } from '@/shared/types/sport';
import { CommentSection } from './components/CommentSection';
import { Feed } from './components/Feed';
import { GroupBroadcasts } from './components/GroupBroadcasts';
import { TrendingHashtags } from './components/TrendingHashtags';
import { UpcomingMatches } from './components/UpcomingMatches';
import { useCommentsData } from './useCommentsData';
import { useHomeFeedData } from './useHomeFeedData';

// Callback-only entry points in this epic — the destinations (hashtag results,
// Matches screen, broadcast detail, add-sport flow) are future tickets.
const noop = () => {};

/**
 * Assembles the Home Feed (HF-7): SportSwitcher above a two-column grid —
 * feed left, rail (Upcoming → Trending → Broadcasts) right, stacking below md
 * (768px; HF-8 hardens responsiveness). TopBar/NavTabs come from AppShell, not
 * here. activeSport is page-local by design — move it to the Zustand store
 * when a second page needs it (client/CLAUDE.md).
 *
 * Feed's posts are real (FEED-1, `usePersonalFeed()` behind
 * `useHomeFeedData()`) — sportProfiles/upcomingMatches/hashtags/broadcasts
 * stay mock until SPORT-1/FEED-6/FEED-7 land. isLoading/isError now come
 * from the real feed query; Feed itself renders nothing for either today
 * (FEED-8 owns the actual loading/error UI).
 */
export function HomeFeedPage() {
  const [activeSport, setActiveSport] = useState<SportKey | 'all'>('all');
  // Which post's comment dialog is open — page-local UI state (client/CLAUDE.md),
  // not Zustand, since it's ephemeral and scoped to this one page.
  const [activeCommentsPostId, setActiveCommentsPostId] = useState<number | null>(null);
  // HomeFeedPage renders behind ProtectedRoute (AUTH-4), so user is guaranteed
  // non-null here — same guarantee AppShell already relies on.
  const user = useAuthStore((state) => state.user)!;
  const {
    data,
    isLoading,
    isError,
    toggleLike,
    deletePost,
    currentUserId,
    hasMorePosts,
    isFetchingMorePosts,
    fetchMorePosts,
  } = useHomeFeedData();
  const commentsData = useCommentsData(
    activeCommentsPostId ?? -1,
    activeCommentsPostId !== null,
  );

  const sportsByKey = useMemo(
    () =>
      Object.fromEntries(data.sportProfiles.map((sport) => [sport.key, sport])) as Record<
        SportKey,
        SportProfile
      >,
    [data.sportProfiles],
  );

  // The post whose comment thread is open, plus its resolved sport badge —
  // CommentSection shows both in its header/body (design-reference-post-modal.html),
  // same sportId->SportProfile resolution Feed.tsx already does per post.
  const activeCommentsPost = data.posts.find((post) => post.id === activeCommentsPostId) ?? null;
  const activeCommentsPostSportKey =
    activeCommentsPost !== null ? sportKeyForId(activeCommentsPost.sportId) : undefined;
  const activeCommentsPostSport =
    activeCommentsPostSportKey !== undefined ? (sportsByKey[activeCommentsPostSportKey] ?? null) : null;

  return (
    <main className="py-4">
      {/* The rail cards introduce h2s; give the page its h1 for AT users (HF-8) */}
      <h1 className="sr-only">Home Feed</h1>
      <div className="mb-4">
        <SportSwitcher
          sports={data.sportProfiles}
          active={activeSport}
          onChange={setActiveSport}
          onAddSport={noop}
        />
      </div>
      <div className="grid grid-cols-1 gap-3.5 md:grid-cols-[1.6fr_1fr]">
        <div className="min-w-0">
          <Feed
            posts={data.posts}
            activeSport={activeSport}
            sportsByKey={sportsByKey}
            currentUserId={currentUserId}
            onToggleLike={toggleLike}
            onHashtagClick={noop}
            onDeletePost={deletePost}
            onOpenComments={setActiveCommentsPostId}
            hasMorePosts={hasMorePosts}
            isFetchingMorePosts={isFetchingMorePosts}
            onLoadMore={fetchMorePosts}
            isLoading={isLoading}
            isError={isError}
          />
        </div>
        <div className="flex min-w-0 flex-col gap-3.5">
          <UpcomingMatches
            matches={data.upcomingMatches}
            activeSport={activeSport}
            sportsByKey={sportsByKey}
            onSeeAll={noop}
            onSelectMatch={noop}
          />
          <TrendingHashtags hashtags={data.hashtags} onHashtagClick={noop} />
          <GroupBroadcasts broadcasts={data.broadcasts} onBroadcastClick={noop} />
        </div>
      </div>
      <CommentSection
        isOpen={activeCommentsPostId !== null}
        onClose={() => setActiveCommentsPostId(null)}
        currentUserId={currentUserId}
        currentUser={{ fullName: `${user.firstName} ${user.lastName}`, avatarUrl: user.avatarUrl }}
        post={activeCommentsPost}
        sport={activeCommentsPostSport}
        comments={commentsData.data}
        isLoading={commentsData.isLoading}
        isError={commentsData.isError}
        hasMore={commentsData.hasMore}
        isFetchingMore={commentsData.isFetchingMore}
        onFetchMore={commentsData.fetchMore}
        onAddComment={commentsData.addComment}
        onAddReply={commentsData.addReply}
        isPosting={commentsData.isPosting}
        onDeleteComment={commentsData.deleteComment}
        onToggleCommentLike={commentsData.toggleCommentLike}
      />
    </main>
  );
}
