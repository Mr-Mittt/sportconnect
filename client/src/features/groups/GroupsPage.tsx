import { useMemo, useState } from 'react';
import { useAuthStore } from '@/app/authStore';
import { useFeedSpaceStore } from '@/app/feedSpaceStore';
import { useCreateGroup } from '@/features/feed/hooks/useCreateGroup';
import { SPORT_ID_BY_KEY, sportKeyForId } from '@/features/feed/sportIdMap';
import { useCommentsData } from '@/features/feed/useCommentsData';
import { CommentSection } from '@/shared/components/CommentSection';
import { CreatePostForm } from '@/shared/components/CreatePostForm';
import { Feed } from '@/shared/components/Feed';
import { GroupBroadcasts } from '@/shared/components/GroupBroadcasts';
import { SportSwitcher } from '@/shared/components/SportSwitcher';
import { TrendingHashtags } from '@/shared/components/TrendingHashtags';
import { UpcomingMatches } from '@/shared/components/UpcomingMatches';
import type { SportKey, SportProfile } from '@/shared/types/sport';
import { CreateGroupModal } from './components/CreateGroupModal';
import { GroupSpaceSwitcher } from './components/GroupSpaceSwitcher';
import { JoinGroupModal } from './components/JoinGroupModal';
import { useGroupsPageData } from './useGroupsPageData';
import { useJoinGroupModalData } from './useJoinGroupModalData';

// Callback-only entry points with no destination yet — same "affordance
// exists, destination doesn't yet" pattern as HF-3/HF-4/HF-7's other no-ops.
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
 * user decision) is identical to Home Feed's — same shared components, same
 * mock-backed hooks, not a group-scoped variant.
 */
export function GroupsPage() {
  const activeSport = useFeedSpaceStore((state) => state.activeSport);
  const setActiveSport = useFeedSpaceStore((state) => state.setActiveSport);
  const [activeCommentsPostId, setActiveCommentsPostId] = useState<number | null>(null);
  const [isCreateGroupOpen, setIsCreateGroupOpen] = useState(false);
  const [isJoinGroupOpen, setIsJoinGroupOpen] = useState(false);
  // Bumped on every open (not close) — remounts CreateGroupModal so its
  // internal form field state starts fresh each time, without an effect
  // calling setState. JoinGroupModal doesn't need this — its search state
  // lives in useJoinGroupModalData below, not in the component itself.
  const [createGroupOpenCount, setCreateGroupOpenCount] = useState(0);
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
    deletePost,
    createPost,
    isCreatingPost,
    currentUserId,
    hasMorePosts,
    isFetchingMorePosts,
    fetchMorePosts,
  } = useGroupsPageData();
  const commentsData = useCommentsData(
    activeCommentsPostId ?? -1,
    activeCommentsPostId !== null,
  );
  const createGroupMutation = useCreateGroup(currentUserId);
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

  const activeCommentsPost = data.posts.find((post) => post.id === activeCommentsPostId) ?? null;
  const activeCommentsPostSportKey =
    activeCommentsPost !== null ? sportKeyForId(activeCommentsPost.sportId) : undefined;
  const activeCommentsPostSport =
    activeCommentsPostSportKey !== undefined ? (sportsByKey[activeCommentsPostSportKey] ?? null) : null;

  return (
    <main className="py-4">
      <h1 className="sr-only">Groups</h1>
      <div className="mb-3">
        <SportSwitcher
          sports={data.sportProfiles}
          active={activeSport}
          onChange={setActiveSport}
          onAddSport={noop}
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
        />
      </div>
      {selectedGroupId !== null && (
        <CreatePostForm
          currentUser={{ firstName: user.firstName, fullName: `${user.firstName} ${user.lastName}`, avatarUrl: user.avatarUrl }}
          onSubmit={createPost}
          isSubmitting={isCreatingPost}
          onPhotoClick={noop}
          onLocationClick={noop}
          onTagSportClick={noop}
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
      <CreateGroupModal
        key={createGroupOpenCount}
        isOpen={isCreateGroupOpen}
        onClose={() => setIsCreateGroupOpen(false)}
        sportsByKey={sportsByKey}
        lockedSport={lockedSport}
        isSubmitting={createGroupMutation.isPending}
        isError={createGroupMutation.isError}
        onSubmit={(payload) =>
          createGroupMutation.mutate(payload, {
            onSuccess: (group) => {
              selectGroup(group.id);
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
    </main>
  );
}
