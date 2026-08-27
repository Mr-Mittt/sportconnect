import { useState } from 'react';
import { useAuthStore } from '@/app/authStore';
import { useCommentsData } from '@/features/feed/useCommentsData';
import { useHashtagResultsData } from '@/features/feed/useHashtagResultsData';
import { usePost } from '@/features/feed/hooks/usePost';
import { sportKeyForId } from '@/features/feed/sportIdMap';
import { CreatePostForm } from '@/shared/components/CreatePostForm';
import { Feed } from '@/shared/components/Feed';
import { CommentSection } from '@/shared/components/CommentSection';
import { HashtagPostsModal } from '@/shared/components/HashtagPostsModal';
import { usePostsTabData } from '../usePostsTabData';

/**
 * The `/profile` page's Posts tab (PROFILE-2) — composer + the caller's own
 * posts, both fully real. Local `useState` for which post's comments are
 * open (unlike Home Feed's FEED-12, this isn't URL-routed — no `/profile`
 * route with a post-id param exists, and nothing requires this tab's comment
 * dialog to be a deep link). Hashtag click-through reuses `HashtagPostsModal`
 * exactly as Home Feed/Groups do, so a hashtag rendered in one of the
 * caller's own posts behaves identically everywhere it can be clicked.
 */
export function PostsTab() {
  const user = useAuthStore((state) => state.user)!;
  const {
    data,
    activeSport,
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
  } = usePostsTabData();

  const [activeCommentsPostId, setActiveCommentsPostId] = useState<number | null>(null);
  const [activeHashtag, setActiveHashtag] = useState<string | null>(null);
  const [isHashtagModalOpen, setIsHashtagModalOpen] = useState(false);

  const commentsData = useCommentsData(activeCommentsPostId ?? -1, activeCommentsPostId !== null);
  const activeCommentsPostQuery = usePost(
    activeCommentsPostId ?? -1,
    activeCommentsPostId !== null,
  );
  const hashtagResultsData = useHashtagResultsData(activeHashtag, isHashtagModalOpen);

  const activeCommentsPost = activeCommentsPostQuery.data ?? null;
  const activeCommentsPostSportKey =
    activeCommentsPost !== null ? sportKeyForId(activeCommentsPost.sportId) : undefined;
  const activeCommentsPostSport =
    activeCommentsPostSportKey !== undefined
      ? (data.sportsByKey[activeCommentsPostSportKey] ?? null)
      : null;

  const openComments = (postId: number) => setActiveCommentsPostId(postId);
  const closeComments = () => setActiveCommentsPostId(null);

  const openHashtag = (tag: string) => {
    setActiveHashtag(tag);
    setIsHashtagModalOpen(true);
  };

  return (
    <div className="flex flex-col gap-2.5">
      <CreatePostForm
        currentUser={{
          firstName: user.firstName,
          fullName: `${user.firstName} ${user.lastName}`,
          avatarUrl: user.avatarUrl,
        }}
        onSubmit={(content) => createPost(content)}
        isSubmitting={isCreatingPost}
        onPhotoClick={() => {}}
        onLocationClick={() => {}}
        onTagSportClick={() => {}}
        isError={isCreatePostError}
      />
      <Feed
        posts={data.posts}
        // 'all' here is Feed's own generic prop contract (shared with Home Feed/Groups, where it's
        // a real navigable state), never this page's — activeSport is only undefined in the
        // zero-sport-profile edge case, where there's nothing to filter by anyway.
        activeSport={activeSport ?? 'all'}
        sportsByKey={data.sportsByKey}
        currentUserId={currentUserId}
        onToggleLike={toggleLike}
        onHashtagClick={openHashtag}
        onDeletePost={deletePost}
        onOpenComments={openComments}
        hasMorePosts={hasMorePosts}
        isFetchingMorePosts={isFetchingMorePosts}
        onLoadMore={fetchMorePosts}
        isLoading={isLoading}
        isError={isError}
        onRetry={retryPosts}
        isLoadMoreError={isLoadMorePostsError}
        emptyMessage="No posts yet for this sport."
      />
      <CommentSection
        isOpen={activeCommentsPostId !== null}
        onClose={closeComments}
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
          if (activeCommentsPost !== null) toggleLikeForPost(activeCommentsPost);
        }}
        onHashtagClick={(tag) => {
          closeComments();
          openHashtag(tag);
        }}
      />
      <HashtagPostsModal
        isOpen={isHashtagModalOpen}
        onClose={() => {
          setIsHashtagModalOpen(false);
          setActiveHashtag(null);
        }}
        tag={activeHashtag}
        posts={hashtagResultsData.data.posts}
        sportsByKey={data.sportsByKey}
        currentUserId={hashtagResultsData.currentUserId}
        onToggleLike={hashtagResultsData.toggleLike}
        onHashtagClick={(tag) => setActiveHashtag(tag)}
        onDeletePost={hashtagResultsData.deletePost}
        onOpenComments={(postId) => {
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
    </div>
  );
}
