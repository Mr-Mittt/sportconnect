import { useMemo, useState } from 'react';
import { useAuthStore } from '@/app/authStore';
import { useFeedSpaceStore } from '@/app/feedSpaceStore';
import { sportKeyForId } from '@/features/feed/sportIdMap';
import { useCommentsData } from '@/features/feed/useCommentsData';
import { CommentSection } from '@/shared/components/CommentSection';
import { CreatePostForm } from '@/shared/components/CreatePostForm';
import { Feed } from '@/shared/components/Feed';
import { SportSwitcher } from '@/shared/components/SportSwitcher';
import type { SportKey, SportProfile } from '@/shared/types/sport';
import { GroupSpaceSwitcher } from './components/GroupSpaceSwitcher';
import { useGroupsPageData } from './useGroupsPageData';

// Real destinations (CreateGroupModal/JoinGroupModal) are FEED-5 — bare
// entry points here, same "affordance exists, destination doesn't yet"
// pattern as HF-3/HF-4/HF-7's other no-op callbacks.
const noop = () => {};

/**
 * Groups page (FEED-4) — the actual home of "which space am I looking at":
 * personal-vs-group switching that the ticket's spec describes lives here,
 * not inline on Home Feed (user decision). Reached via NavTabs' existing
 * "Groups" destination (previously a ComingSoonPage stub).
 *
 * activeSport is read from the shared `feedSpaceStore`, so it's carried over
 * from whatever was active on Home Feed (user decision) and remains
 * switchable from here too — one source of truth either page can change.
 * GroupSpaceSwitcher's group list is filtered to that sport (a group is 1:1
 * with a sport, so this is exact). CreatePostForm only renders when a
 * specific group is selected — "All" has no single group to post into.
 */
export function GroupsPage() {
  const activeSport = useFeedSpaceStore((state) => state.activeSport);
  const setActiveSport = useFeedSpaceStore((state) => state.setActiveSport);
  const [activeCommentsPostId, setActiveCommentsPostId] = useState<number | null>(null);
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
          onCreateGroup={noop}
          onJoinGroup={noop}
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
