import { useMemo, useState } from 'react';
import { useAuthStore } from '@/app/authStore';
import { useFeedSpaceStore } from '@/app/feedSpaceStore';
import { useCreateGroup } from '@/features/feed/hooks/useCreateGroup';
import { usePost } from '@/features/feed/hooks/usePost';
import { SPORT_ID_BY_KEY, sportKeyForId } from '@/features/feed/sportIdMap';
import { useCommentsData } from '@/features/feed/useCommentsData';
import { useHashtagResultsData } from '@/features/feed/useHashtagResultsData';
import { AddSportModal } from '@/shared/components/AddSportModal';
import { CommentSection } from '@/shared/components/CommentSection';
import { CreatePostForm } from '@/shared/components/CreatePostForm';
import { Feed } from '@/shared/components/Feed';
import { GroupBroadcasts } from '@/shared/components/GroupBroadcasts';
import { HashtagPostsModal } from '@/shared/components/HashtagPostsModal';
import { SportSwitcher } from '@/shared/components/SportSwitcher';
import { TrendingHashtags } from '@/shared/components/TrendingHashtags';
import { UpcomingMatches } from '@/shared/components/UpcomingMatches';
import { UpdateBroadcastConfirmDialog } from '@/shared/components/UpdateBroadcastConfirmDialog';
import { useAddSportProfile } from '@/shared/hooks/useAddSportProfile';
import { ALL_SPORT_KEYS } from '@/shared/lib/sportProfileConfig';
import type { SportKey, SportProfile } from '@/shared/types/sport';
import { CreateGroupModal } from './components/CreateGroupModal';
import { GroupSpaceSwitcher } from './components/GroupSpaceSwitcher';
import { JoinGroupModal } from './components/JoinGroupModal';
import { useGroupsPageData } from './useGroupsPageData';
import { useJoinGroupModalData } from './useJoinGroupModalData';

// Callback-only entry points with no destination yet — same "affordance
// exists, destination doesn't yet" pattern as HF-3/HF-4/HF-7's other no-ops.
// Hashtag click-through is real now (FEED-6, via HashtagPostsModal).
const noop = () => {};

/**
 * Groups page (FEED-4, rail + create/join FEED-5) — the actual home of
 * "which space am I looking at": personal-vs-group switching that the
 * ticket's spec describes lives here, not inline on Home Feed (user
 * decision). Reached via NavTabs' existing "Groups" destination (previously
 * a ComingSoonPage stub).
 *
 * activeSport is read from the shared `feedSpaceStore`, so it's carried over
 * from whatever was active on Home Feed (user decision) and remains
 * switchable from here too — one source of truth either page can change.
 * GroupSpaceSwitcher's group list is filtered to that sport (a group is 1:1
 * with a sport, so this is exact). CreatePostForm only renders when a
 * specific group is selected — "All" has no single group to post into.
 *
 * The right rail (UpcomingMatches → TrendingHashtags → GroupBroadcasts, FEED-5
 * user decision) is identical to Home Feed's — same shared components and
 * hooks, not a group-scoped variant. Hashtags (FEED-6) and broadcasts
 * (FEED-7) are real now; upcomingMatches stays mock (no matches backend).
 *
 * Hashtag click-through opens `HashtagPostsModal` via page-local
 * `activeHashtag` state, same pattern as `HomeFeedPage` — clicking a post's
 * comment icon while it's open closes it first and opens `CommentSection`.
 *
 * FEED-7: `CreatePostForm`'s "Broadcast" toggle only appears when
 * `canBroadcast` (the selected group's owner/admin). Submitting with it on
 * either creates a new `GROUP_BROADCAST` post, or — if the group already has
 * one active (the backend caps at one per group) — opens
 * `UpdateBroadcastConfirmDialog` instead of letting the create call 400;
 * confirming updates the existing broadcast's content in place (user
 * decision). `pendingBroadcastContent !== null` doubles as that dialog's
 * open state, same `activeCommentsPostId`-style convention already used here.
 */
export function GroupsPage() {
  const activeSport = useFeedSpaceStore((state) => state.activeSport);
  const setActiveSport = useFeedSpaceStore((state) => state.setActiveSport);
  // FEED-12: page-local only, unlike HomeFeedPage's URL-driven version —
  // navigating away to `/posts/:id` would unmount this page (and its
  // selected-group state) since that route renders HomeFeedPage, not this
  // one. Still benefits from usePost below (avoids the fragile feed-cache
  // lookup this used to do), just without the URL/deep-link piece.
  const [activeCommentsPostId, setActiveCommentsPostId] = useState<number | null>(null);
  // Which hashtag's results modal is open — same page-local UI-state
  // reasoning as activeCommentsPostId (FEED-6). Split into two pieces
  // deliberately: `activeHashtag` also drives useHashtagResultsData's query
  // and must stay set (so its cached posts survive) even while the modal is
  // visually hidden mid-transition to CommentSection — only `isHashtagModalOpen`
  // controls the Dialog's actual visibility. Clearing `activeHashtag` too
  // (i.e. tearing down the query) at the same time as opening comments would
  // make usePost's own findPostInFeedCaches initialData seed (which scans
  // this same query) see an empty list in that same render (a real bug this
  // shape avoids).
  const [activeHashtag, setActiveHashtag] = useState<string | null>(null);
  const [isHashtagModalOpen, setIsHashtagModalOpen] = useState(false);
  // Holds the composer's content while UpdateBroadcastConfirmDialog is open
  // (the group already has an active broadcast) — null both before and
  // after (doubles as the dialog's isOpen), same convention as
  // activeCommentsPostId (FEED-7).
  const [pendingBroadcastContent, setPendingBroadcastContent] = useState<string | null>(null);
  const [isCreateGroupOpen, setIsCreateGroupOpen] = useState(false);
  const [isJoinGroupOpen, setIsJoinGroupOpen] = useState(false);
  const [isAddSportOpen, setIsAddSportOpen] = useState(false);
  // Bumped on every open (not close) — remounts CreateGroupModal/AddSportModal
  // so their internal form field state starts fresh each time, without an
  // effect calling setState. JoinGroupModal doesn't need this — its search
  // state lives in useJoinGroupModalData below, not in the component itself.
  const [createGroupOpenCount, setCreateGroupOpenCount] = useState(0);
  const [addSportOpenCount, setAddSportOpenCount] = useState(0);
  // GroupsPage renders behind ProtectedRoute (AUTH-4), so user is guaranteed
  // non-null here — same guarantee HomeFeedPage already relies on.
  const user = useAuthStore((state) => state.user)!;
  const {
    data,
    selectedGroupId,
    selectGroup,
    isLoading,
    isError,
    toggleLike,
    toggleLikeForPost,
    deletePost,
    createPost,
    isCreatingPost,
    isCreatePostError,
    canBroadcast,
    activeBroadcastForSelectedGroup,
    updateBroadcast,
    isUpdatingBroadcast,
    isBroadcastUpdateError,
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
    isGroupsLoading,
    isGroupsError,
    retryGroups,
  } = useGroupsPageData();
  // Clicking a group post's "> groupname" link (only rendered in the "All"
  // groups view) — switches to that group's sport (a group is 1:1 with
  // exactly one sport) and selects it, same as clicking its GroupSpaceSwitcher
  // chip would. No navigation needed — already on this page.
  const goToGroup = (groupId: number, sportId: number) => {
    setActiveSport(sportKeyForId(sportId) ?? 'all');
    selectGroup(groupId, sportId);
  };
  const commentsData = useCommentsData(
    activeCommentsPostId ?? -1,
    activeCommentsPostId !== null,
  );
  const activeCommentsPostQuery = usePost(activeCommentsPostId ?? -1, activeCommentsPostId !== null);
  const hashtagResultsData = useHashtagResultsData(activeHashtag, activeHashtag !== null);
  const createGroupMutation = useCreateGroup(currentUserId);
  const addSportMutation = useAddSportProfile(currentUserId);
  const lockedSport = activeSport !== 'all' ? activeSport : null;
  const joinGroupModalData = useJoinGroupModalData(
    currentUserId,
    lockedSport !== null ? SPORT_ID_BY_KEY[lockedSport] : undefined,
    isJoinGroupOpen,
  );

  const sportsByKey = useMemo(
    () =>
      Object.fromEntries(data.sportProfiles.map((sport) => [sport.key, sport])) as Record<
        SportKey,
        SportProfile
      >,
    [data.sportProfiles],
  );
  const availableSports = useMemo(
    () => ALL_SPORT_KEYS.filter((key) => !data.sportProfiles.some((sport) => sport.key === key)),
    [data.sportProfiles],
  );

  // FEED-12: comes from usePost, not a feed-cache lookup — see
  // HomeFeedPage's own equivalent comment for the full reasoning.
  const activeCommentsPost = activeCommentsPostQuery.data ?? null;
  const activeCommentsPostSportKey =
    activeCommentsPost !== null ? sportKeyForId(activeCommentsPost.sportId) : undefined;
  const activeCommentsPostSport =
    activeCommentsPostSportKey !== undefined ? (sportsByKey[activeCommentsPostSportKey] ?? null) : null;

  // Broadcasting into a group that already has one active would 400 —
  // detect it client-side and open the confirm-update dialog instead of
  // calling create (FEED-7 user decision).
  const handleSubmitPost = (content: string, options: { asBroadcast: boolean }) => {
    if (options.asBroadcast && activeBroadcastForSelectedGroup !== null) {
      setPendingBroadcastContent(content);
      return;
    }
    createPost(content, options);
  };

  const confirmUpdateBroadcast = () => {
    if (pendingBroadcastContent === null) return;
    updateBroadcast(pendingBroadcastContent, { onSuccess: () => setPendingBroadcastContent(null) });
  };

  return (
    <main className="py-4">
      <h1 className="sr-only">Groups</h1>
      <div className="mb-3">
        <SportSwitcher
          sports={data.sportProfiles}
          active={activeSport}
          onChange={setActiveSport}
          onAddSport={() => {
            setAddSportOpenCount((count) => count + 1);
            setIsAddSportOpen(true);
          }}
        />
      </div>
      <div className="mb-4">
        <GroupSpaceSwitcher
          groups={data.groups}
          selectedGroupId={selectedGroupId}
          onSelect={selectGroup}
          onCreateGroup={() => {
            setCreateGroupOpenCount((count) => count + 1);
            setIsCreateGroupOpen(true);
          }}
          onJoinGroup={() => setIsJoinGroupOpen(true)}
          sportsByKey={sportsByKey}
          isLoading={isGroupsLoading}
          isError={isGroupsError}
          onRetry={retryGroups}
        />
      </div>
      {selectedGroupId !== null && (
        <CreatePostForm
          currentUser={{ firstName: user.firstName, fullName: `${user.firstName} ${user.lastName}`, avatarUrl: user.avatarUrl }}
          onSubmit={handleSubmitPost}
          isSubmitting={isCreatingPost}
          isError={isCreatePostError}
          onPhotoClick={noop}
          onLocationClick={noop}
          onTagSportClick={noop}
          canBroadcast={canBroadcast}
        />
      )}
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
            onOpenComments={setActiveCommentsPostId}
            hasMorePosts={hasMorePosts}
            isFetchingMorePosts={isFetchingMorePosts}
            onLoadMore={fetchMorePosts}
            isLoading={isLoading}
            isError={isError}
            showSportBadge={activeSport === 'all'}
            groupsById={data.groupsById}
            showGroupName={selectedGroupId === null}
            onGroupClick={goToGroup}
            onRetry={retryPosts}
            isLoadMoreError={isLoadMorePostsError}
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
        onClose={() => setActiveCommentsPostId(null)}
        currentUserId={currentUserId}
        currentUser={{ fullName: `${user.firstName} ${user.lastName}`, avatarUrl: user.avatarUrl }}
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
          // FEED-12: takes the already-resolved post directly — see
          // HomeFeedPage's own equivalent comment for the full reasoning.
          if (activeCommentsPost !== null) toggleLikeForPost(activeCommentsPost);
        }}
        onHashtagClick={(tag) => {
          // Symmetric with HashtagPostsModal's own "close first" behavior —
          // close the comment dialog before opening the hashtag modal,
          // rather than stacking two dialogs.
          setActiveCommentsPostId(null);
          setActiveHashtag(tag);
          setIsHashtagModalOpen(true);
        }}
      />
      <CreateGroupModal
        key={`create-group-${createGroupOpenCount}`}
        isOpen={isCreateGroupOpen}
        onClose={() => setIsCreateGroupOpen(false)}
        sportsByKey={sportsByKey}
        lockedSport={lockedSport}
        isSubmitting={createGroupMutation.isPending}
        isError={createGroupMutation.isError}
        onSubmit={(payload) =>
          createGroupMutation.mutate(payload, {
            onSuccess: (group) => {
              selectGroup(group.id, group.sportId);
              setIsCreateGroupOpen(false);
            },
          })
        }
      />
      <JoinGroupModal
        isOpen={isJoinGroupOpen}
        onClose={() => setIsJoinGroupOpen(false)}
        inputValue={joinGroupModalData.inputValue}
        onInputChange={joinGroupModalData.setInputValue}
        onSearch={joinGroupModalData.submitSearch}
        results={joinGroupModalData.results}
        isSearching={joinGroupModalData.isSearching}
        isSearchError={joinGroupModalData.isSearchError}
        pendingGroupIds={joinGroupModalData.pendingGroupIds}
        onRequestToJoin={joinGroupModalData.requestToJoin}
        isRequesting={joinGroupModalData.isRequesting}
        isRequestError={joinGroupModalData.isRequestError}
      />
      <AddSportModal
        key={`add-sport-${addSportOpenCount}`}
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
          setActiveCommentsPostId(postId);
        }}
        hasMorePosts={hashtagResultsData.hasMorePosts}
        isFetchingMorePosts={hashtagResultsData.isFetchingMorePosts}
        onLoadMore={hashtagResultsData.fetchMorePosts}
        isLoading={hashtagResultsData.isLoading}
        isError={hashtagResultsData.isError}
        onRetry={hashtagResultsData.retryPosts}
        isLoadMoreError={hashtagResultsData.isLoadMorePostsError}
      />
      <UpdateBroadcastConfirmDialog
        isOpen={pendingBroadcastContent !== null}
        onClose={() => setPendingBroadcastContent(null)}
        onConfirm={confirmUpdateBroadcast}
        isSubmitting={isUpdatingBroadcast}
        isError={isBroadcastUpdateError}
        existingText={activeBroadcastForSelectedGroup?.content ?? ''}
      />
    </main>
  );
}
