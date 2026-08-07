import { useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuthStore } from '@/app/authStore';
import { useGroupsPageStore } from '@/app/groupsPageStore';
import { useHomeFeedStore } from '@/app/homeFeedStore';
import { usePost } from '@/features/feed/hooks/usePost';
import { sportIdForKey, sportKeyForId } from '@/features/feed/sportIdMap';
import { useCommentsData } from '@/features/feed/useCommentsData';
import { useHashtagResultsData } from '@/features/feed/useHashtagResultsData';
import { CreateSessionModal } from '@/features/session/components/CreateSessionModal';
import { SessionDetailModal } from '@/features/session/components/SessionDetailModal';
import { SessionDiscoverModal } from '@/features/session/components/SessionDiscoverModal';
import { useCreateSessionModalData } from '@/features/session/useCreateSessionModalData';
import { useDiscoverModalData } from '@/features/session/useDiscoverModalData';
import { AddSportModal } from '@/shared/components/AddSportModal';
import { CommentSection } from '@/shared/components/CommentSection';
import { CreatePostForm } from '@/shared/components/CreatePostForm';
import { Feed } from '@/shared/components/Feed';
import { GroupBroadcasts } from '@/shared/components/GroupBroadcasts';
import { HashtagPostsModal } from '@/shared/components/HashtagPostsModal';
import { SportSwitcher } from '@/shared/components/SportSwitcher';
import { TrendingHashtags } from '@/shared/components/TrendingHashtags';
import { UpcomingMatches } from '@/shared/components/UpcomingMatches';
import { useAddSportProfile } from '@/shared/hooks/useAddSportProfile';
import { useSportCatalog } from '@/shared/hooks/useSportCatalog';
import { useAnchorBottom, ModalAnchorProvider } from '@/shared/lib/modalAnchor';
import type { SportKey, SportProfile } from '@/shared/types/sport';
import { useHomeFeedData } from './useHomeFeedData';

// Callback-only entry points in this epic — the destinations (Matches screen,
// broadcast detail) are future tickets. "Add sport" is real (SPORT-1);
// hashtag click-through is real now too (FEED-6, via HashtagPostsModal).
const noop = () => {};

/**
 * Assembles the Home Feed (HF-7): SportSwitcher above a two-column grid —
 * feed left, rail (Upcoming → Trending → Broadcasts) right, stacking below md
 * (768px; HF-8 hardens responsiveness). TopBar/NavTabs come from AppShell, not
 * here. activeSport lives in its own `homeFeedStore` — independent of the
 * Groups page's `groupsPageStore` (2026-07-25 decision, reversing FEED-4's
 * original single shared store: switching sport on one page used to be able
 * to silently affect the other, since both read/wrote the same field).
 *
 * Feed's posts are real (FEED-1, `usePersonalFeed()` behind
 * `useHomeFeedData()`); sportProfiles (SPORT-1) and hashtags (FEED-6) are
 * real too — upcomingMatches/broadcasts stay mock until FEED-7 lands (matches
 * stay mock for the whole MVP, no backend module exists). isLoading/isError
 * now come from the real feed query; Feed itself renders nothing for either
 * today (FEED-8 owns the actual loading/error UI). Home Feed always shows the
 * personal feed — group-feed switching lives entirely on the Groups page
 * (FEED-4); selectedGroupId is irrelevant here.
 *
 * Hashtag click-through (FEED-6) opens `HashtagPostsModal` via page-local
 * `activeHashtag` state — clicking a post's comment icon while that modal is
 * open closes it first and opens `CommentSection` instead (user decision:
 * simpler than stacking two dialogs).
 *
 * FEED-12: the comment dialog's open state now lives in the URL
 * (`/posts/:postId`, matched here via `useParams`), not page-local state —
 * this is what makes a shared link work (App.tsx routes `/posts/:postId` to
 * this same page) and gives Back/Forward the dialog's open/close for free.
 * Opening pushes a history entry (`navigate(`/posts/${id}`)`); closing
 * always lands deterministically on `/` (`replace: true`) regardless of
 * whether there's a meaningful "back" target in this session (there isn't,
 * on a cold direct load of a shared link). The post itself comes from
 * `usePost`, not a feed-cache lookup — decoupling the dialog from feed
 * pagination and making it work from a cold load with no prior fetch at all.
 */
export function HomeFeedPage() {
  const activeSport = useHomeFeedStore((state) => state.activeSport);
  const setActiveSport = useHomeFeedStore((state) => state.setActiveSport);
  // Only used to hand off to the Groups page's own state below (`goToGroup`)
  // — Home Feed never reads the Groups page's selection/sport itself.
  const selectGroupOnGroupsPage = useGroupsPageStore((state) => state.selectGroup);
  const navigate = useNavigate();
  // Source of truth for which post's comment dialog is open — the URL, not
  // local state (FEED-12). `useParams` re-runs on every route match, so this
  // stays in sync with in-app navigation, browser Back/Forward, and a cold
  // direct load alike.
  const { postId: postIdParam } = useParams<{ postId: string }>();
  const activeCommentsPostId = postIdParam !== undefined ? Number(postIdParam) : null;
  const openComments = (postId: number) => navigate(`/posts/${postId}`);
  const closeComments = () => navigate('/', { replace: true });
  // Clicking a group post's "> groupname" link — tells the Groups page which
  // group to show (its own `selectGroup` already derives that page's sport
  // pill to match, same as `GroupSpaceSwitcher`'s own click behavior), then
  // navigates there. Deliberately does NOT touch Home Feed's own
  // `activeSport` — the two pages' sport pills are independent.
  const goToGroup = (groupId: number, sportId: number) => {
    selectGroupOnGroupsPage(groupId, sportId);
    navigate('/groups');
  };
  // Which hashtag's results modal is open — still page-local state (unlike
  // activeCommentsPostId above, this one has no URL representation — FEED-6
  // never scoped it that way, and this ticket doesn't expand it). Split into
  // two pieces deliberately: `activeHashtag` also drives
  // useHashtagResultsData's query and must stay set (so its cached posts
  // survive) even while the modal is visually hidden mid-transition to
  // CommentSection — only `isHashtagModalOpen` controls the Dialog's actual
  // visibility. Clearing `activeHashtag` too (i.e. tearing down the query) at
  // the same time as opening comments would make usePost's own
  // findPostInFeedCaches initialData seed (which scans this same query) see
  // an empty list in that same render (a real bug this shape avoids).
  const [activeHashtag, setActiveHashtag] = useState<string | null>(null);
  const [isHashtagModalOpen, setIsHashtagModalOpen] = useState(false);
  const [isAddSportOpen, setIsAddSportOpen] = useState(false);
  // Bumped on every open (not close) — remounts AddSportModal so its internal
  // form field state starts fresh each time, same reasoning as
  // GroupsPage's createGroupOpenCount for CreateGroupModal.
  const [addSportOpenCount, setAddSportOpenCount] = useState(0);
  // HomeFeedPage renders behind ProtectedRoute (AUTH-4), so user is guaranteed
  // non-null here — same guarantee AppShell already relies on.
  const user = useAuthStore((state) => state.user)!;
  const {
    data,
    isLoading,
    isError,
    toggleLike,
    toggleLikeForPost,
    deletePost,
    createPost,
    isCreatingPost,
    isCreatePostError,
    currentUserId,
    hasMorePosts,
    isFetchingMorePosts,
    fetchMorePosts,
    isLoadMorePostsError,
    retryPosts,
    isHashtagsLoading,
    isHashtagsError,
    retryHashtags,
    isBroadcastsLoading,
    isBroadcastsError,
    retryBroadcasts,
  } = useHomeFeedData();
  const commentsData = useCommentsData(activeCommentsPostId ?? -1, activeCommentsPostId !== null);
  const activeCommentsPostQuery = usePost(
    activeCommentsPostId ?? -1,
    activeCommentsPostId !== null,
  );
  const hashtagResultsData = useHashtagResultsData(activeHashtag, activeHashtag !== null);
  const addSportMutation = useAddSportProfile(currentUserId);
  const sportCatalog = useSportCatalog();
  const availableSports = useMemo(
    () =>
      sportCatalog.data
        .map((sport) => sport.key)
        .filter((key) => !data.sportProfiles.some((sport) => sport.key === key)),
    [sportCatalog.data, data.sportProfiles],
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
  // FEED-12: comes from usePost, not a feed-cache lookup — its own
  // `initialData` already seeds from any mounted feed/hashtag-results cache
  // that has this post, and falls through to a real fetch otherwise (a post
  // outside every loaded cache, or a cold `/posts/:id` load).
  const activeCommentsPost = activeCommentsPostQuery.data ?? null;
  const activeCommentsPostSportKey =
    activeCommentsPost !== null ? sportKeyForId(activeCommentsPost.sportId) : undefined;
  const activeCommentsPostSport =
    activeCommentsPostSportKey !== undefined
      ? (sportsByKey[activeCommentsPostSportKey] ?? null)
      : null;

  // Every modal on this page positions below the sport pill row (user
  // decision) — measured live so it tracks pill wrapping at narrow widths.
  const sportSwitcherRef = useRef<HTMLDivElement>(null);
  const modalAnchorBottom = useAnchorBottom(sportSwitcherRef);

  // CLIENT-SESSION-7: UpcomingMatches' empty-state CTAs. One hook/modal instance shared with
  // Groups/Friends/Matches (create) and its own self-contained Discover modal instance (each
  // rail-hosting page gets one, scoped to that page's own active sport pill).
  const createSessionModalData = useCreateSessionModalData();
  const activeSportId = activeSport === 'all' ? undefined : sportIdForKey(activeSport);
  const discoverModalData = useDiscoverModalData(activeSportId);

  return (
    <ModalAnchorProvider value={modalAnchorBottom}>
      <main className="py-4">
        {/* The rail cards introduce h2s; give the page its h1 for AT users (HF-8) */}
        <h1 className="sr-only">Home Feed</h1>
        <div className="mb-4" ref={sportSwitcherRef}>
          <SportSwitcher
            sports={data.sportProfiles}
            active={activeSport}
            onChange={setActiveSport}
            maxSports={sportCatalog.data.length || undefined}
            onAddSport={() => {
              setAddSportOpenCount((count) => count + 1);
              setIsAddSportOpen(true);
            }}
          />
        </div>
        <CreatePostForm
          currentUser={{
            firstName: user.firstName,
            fullName: `${user.firstName} ${user.lastName}`,
            avatarUrl: user.avatarUrl,
          }}
          onSubmit={createPost}
          isSubmitting={isCreatingPost}
          isError={isCreatePostError}
          onPhotoClick={noop}
          onLocationClick={noop}
          onTagSportClick={noop}
        />
        <div className="grid grid-cols-1 gap-3.5 md:grid-cols-[1.6fr_1fr]">
          <div className="min-w-0">
            <Feed
              posts={data.posts}
              activeSport={activeSport}
              sportsByKey={sportsByKey}
              currentUserId={currentUserId}
              onToggleLike={toggleLike}
              onHashtagClick={(tag) => {
                setActiveHashtag(tag);
                setIsHashtagModalOpen(true);
              }}
              onDeletePost={deletePost}
              onOpenComments={openComments}
              hasMorePosts={hasMorePosts}
              isFetchingMorePosts={isFetchingMorePosts}
              onLoadMore={fetchMorePosts}
              isLoading={isLoading}
              isError={isError}
              onRetry={retryPosts}
              isLoadMoreError={isLoadMorePostsError}
              groupsById={data.groupsById}
              onGroupClick={goToGroup}
            />
          </div>
          <div className="flex min-w-0 flex-col gap-3.5">
            <UpcomingMatches
              matches={data.upcomingMatches}
              activeSport={activeSport}
              sportsByKey={sportsByKey}
              onSeeAll={() => navigate('/matches')}
              onSelectMatch={(sessionId) => navigate(`/matches?session=${sessionId}`)}
              onCreateMatch={createSessionModalData.openCreateModal}
              onJoinMatch={discoverModalData.openDiscoverModal}
            />
            <TrendingHashtags
              hashtags={data.hashtags}
              onHashtagClick={(tag) => {
                setActiveHashtag(tag);
                setIsHashtagModalOpen(true);
              }}
              isLoading={isHashtagsLoading}
              isError={isHashtagsError}
              onRetry={retryHashtags}
            />
            <GroupBroadcasts
              broadcasts={data.broadcasts}
              onBroadcastClick={noop}
              isLoading={isBroadcastsLoading}
              isError={isBroadcastsError}
              onRetry={retryBroadcasts}
            />
          </div>
        </div>
        <CommentSection
          isOpen={activeCommentsPostId !== null}
          onClose={closeComments}
          currentUserId={currentUserId}
          currentUser={{
            fullName: `${user.firstName} ${user.lastName}`,
            avatarUrl: user.avatarUrl,
          }}
          post={activeCommentsPost}
          sport={activeCommentsPostSport}
          isPostLoading={activeCommentsPostQuery.isLoading}
          isPostError={activeCommentsPostQuery.isError}
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
          onTogglePostLike={() => {
            // FEED-12: toggleLikeForPost takes the already-resolved post
            // directly (from usePost above) rather than re-deriving it from
            // useHomeFeedData's own feed array, which wouldn't find a post
            // reached via a direct link outside the caller's personal feed.
            if (activeCommentsPost !== null) toggleLikeForPost(activeCommentsPost);
          }}
          onHashtagClick={(tag) => {
            // Symmetric with HashtagPostsModal's own "close first" behavior —
            // close the comment dialog before opening the hashtag modal,
            // rather than stacking two dialogs.
            closeComments();
            setActiveHashtag(tag);
            setIsHashtagModalOpen(true);
          }}
        />
        <AddSportModal
          key={addSportOpenCount}
          isOpen={isAddSportOpen}
          onClose={() => setIsAddSportOpen(false)}
          availableSports={availableSports}
          isSubmitting={addSportMutation.isPending}
          isError={addSportMutation.isError}
          onSubmit={(payload) =>
            addSportMutation.mutate(payload, { onSuccess: () => setIsAddSportOpen(false) })
          }
        />
        <HashtagPostsModal
          isOpen={isHashtagModalOpen}
          onClose={() => {
            setIsHashtagModalOpen(false);
            setActiveHashtag(null);
          }}
          tag={activeHashtag}
          posts={hashtagResultsData.data.posts}
          sportsByKey={sportsByKey}
          currentUserId={hashtagResultsData.currentUserId}
          onToggleLike={hashtagResultsData.toggleLike}
          onHashtagClick={(tag) => setActiveHashtag(tag)}
          onDeletePost={hashtagResultsData.deletePost}
          onOpenComments={(postId) => {
            // Hide the modal but keep `activeHashtag` set — see the state
            // declaration's comment for why clearing it here would break
            // usePost's own cache-seeding above.
            setIsHashtagModalOpen(false);
            openComments(postId);
          }}
          hasMorePosts={hashtagResultsData.hasMorePosts}
          isFetchingMorePosts={hashtagResultsData.isFetchingMorePosts}
          onLoadMore={hashtagResultsData.fetchMorePosts}
          isLoading={hashtagResultsData.isLoading}
          isError={hashtagResultsData.isError}
          onRetry={hashtagResultsData.retryPosts}
          isLoadMoreError={hashtagResultsData.isLoadMorePostsError}
        />
        <CreateSessionModal
          key={createSessionModalData.isCreateModalOpen ? 'open' : 'closed'}
          isOpen={createSessionModalData.isCreateModalOpen}
          onClose={createSessionModalData.closeCreateModal}
          sportsByKey={sportsByKey}
          activeSport={activeSport}
          selectedLocation={createSessionModalData.selectedLocationForCreate}
          onOpenLocationPicker={createSessionModalData.onOpenLocationPickerForCreate}
          locationPicker={createSessionModalData.locationPickerForCreate}
          friends={createSessionModalData.friends}
          isFriendsLoading={createSessionModalData.isFriendsLoading}
          onEffectiveSportChange={createSessionModalData.onEffectiveSportChangeForCreate}
          favoriteLocations={createSessionModalData.favoriteLocationsForCreate}
          isFavoriteLocationsLoading={createSessionModalData.isFavoriteLocationsLoading}
          onSelectLocation={createSessionModalData.onSelectLocationForCreate}
          onSubmit={createSessionModalData.submitCreate}
          isSubmitting={createSessionModalData.isCreating}
          isError={createSessionModalData.isCreateError}
          availableSports={availableSports}
          onAddSport={addSportMutation.mutate}
          isAddingSport={addSportMutation.isPending}
          isAddSportError={addSportMutation.isError}
        />
        <SessionDiscoverModal
          isOpen={discoverModalData.isDiscoverModalOpen}
          onClose={discoverModalData.closeDiscoverModal}
          searchMode={discoverModalData.searchMode}
          onSearchModeChange={discoverModalData.setSearchMode}
          searchText={discoverModalData.searchText}
          onSearchTextChange={discoverModalData.setSearchText}
          sessions={discoverModalData.discoverSessions}
          isLoading={discoverModalData.isDiscoverLoading}
          isError={discoverModalData.isDiscoverError}
          sportsByKey={sportsByKey}
          onViewDetails={discoverModalData.onViewDetails}
          availableSports={availableSports}
          onAddSport={addSportMutation.mutate}
          isAddingSport={addSportMutation.isPending}
          isAddSportError={addSportMutation.isError}
        />
        <SessionDetailModal
          isOpen={discoverModalData.selectedSessionId !== null}
          onClose={discoverModalData.closeDetail}
          session={discoverModalData.selectedSession}
          isLoading={discoverModalData.isSessionLoading}
          isError={discoverModalData.isSessionError}
          participants={discoverModalData.participants}
          isParticipantsLoading={discoverModalData.isParticipantsLoading}
          isParticipantsError={discoverModalData.isParticipantsError}
          currentUserId={discoverModalData.currentUserId}
          canManage={discoverModalData.canManage}
          onJoin={discoverModalData.onJoin}
          isJoining={discoverModalData.isJoining}
          isJoinError={discoverModalData.isJoinError}
          onLeave={discoverModalData.onLeave}
          isLeaving={discoverModalData.isLeaving}
          isLeaveError={discoverModalData.isLeaveError}
          onConfirmCancel={discoverModalData.onConfirmCancel}
          isCancelling={discoverModalData.isCancelling}
          isCancelError={discoverModalData.isCancelError}
          requestedParticipants={discoverModalData.requestedParticipants}
          isRequestedParticipantsLoading={discoverModalData.isRequestedParticipantsLoading}
          isRequestedParticipantsError={discoverModalData.isRequestedParticipantsError}
          onApproveParticipant={discoverModalData.onApproveParticipant}
          isApprovingParticipant={discoverModalData.isApprovingParticipant}
          onRejectParticipant={discoverModalData.onRejectParticipant}
          isRejectingParticipant={discoverModalData.isRejectingParticipant}
        />
      </main>
    </ModalAnchorProvider>
  );
}
