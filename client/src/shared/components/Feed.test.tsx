import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Post } from '@/features/feed/types';
import type { SportKey, SportProfile } from '@/shared/types/sport';
import { Feed } from './Feed';

const sportsByKey: Record<SportKey, SportProfile> = {
  football: { key: 'football', label: 'Football', icon: 'ball-football', colorRamp: 'teal' },
  basketball: {
    key: 'basketball',
    label: 'Basketball',
    icon: 'ball-basketball',
    colorRamp: 'coral',
  },
  tennis: { key: 'tennis', label: 'Tennis', icon: 'ball-tennis', colorRamp: 'purple' },
};

class FakeIntersectionObserver {
  observe = vi.fn();
  disconnect = vi.fn();
  unobserve = vi.fn();
}

const makePost = (id: number, sportId: number | null, userFullName: string): Post => ({
  id,
  userId: 'someone-else',
  userFullName,
  userAvatarUrl: null,
  postType: 'USER_FEED',
  groupId: null,
  content: `${userFullName}'s post`,
  latitude: null,
  longitude: null,
  locationName: null,
  sportId,
  sportName: null,
  visibility: 'public',
  media: [],
  hashtags: [],
  previewComments: [],
  likeCount: 0,
  commentCount: 0,
  shareCount: 0,
  isLikedByCurrentUser: false,
  createdAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
  updatedAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
  broadcastEndTime: null,
});

const posts = [
  makePost(1, 5, 'Marcus'), // football (Soccer, id 5)
  makePost(2, 6, 'Priya'), // basketball
  makePost(3, 5, 'Hana'), // football
];

const noop = () => {};
const baseProps = {
  sportsByKey,
  currentUserId: 'someone-else',
  onToggleLike: noop,
  onHashtagClick: noop,
  onDeletePost: noop,
  onOpenComments: noop,
  onLoadMore: noop,
  hasMorePosts: false,
  isFetchingMorePosts: false,
  isLoading: false,
  isError: false,
  onRetry: noop,
  isLoadMoreError: false,
};

describe('Feed', () => {
  beforeEach(() => {
    vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver);
  });

  it('shows all posts when activeSport is "all"', () => {
    render(<Feed {...baseProps} posts={posts} activeSport="all" />);
    expect(screen.getAllByRole('article')).toHaveLength(3);
  });

  it('filters posts by the active sport via the temporary sportId map', () => {
    render(<Feed {...baseProps} posts={posts} activeSport="football" />);
    expect(screen.getAllByRole('article')).toHaveLength(2);
    expect(screen.queryByText("Priya's post")).not.toBeInTheDocument();
  });

  it('renders the empty state for a sport with zero posts', () => {
    render(<Feed {...baseProps} posts={posts} activeSport="tennis" />);
    expect(screen.getByText('No posts yet for this sport.')).toBeInTheDocument();
    expect(screen.queryAllByRole('article')).toHaveLength(0);
  });

  it('renders loading skeletons while isLoading (not the empty-state message)', () => {
    render(<Feed {...baseProps} posts={[]} activeSport="all" isLoading />);
    expect(screen.queryByText('No posts yet for this sport.')).not.toBeInTheDocument();
    expect(screen.queryAllByRole('article')).toHaveLength(0);
  });

  it('renders an error state with a retry action while isError, not the empty-state message', async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    render(<Feed {...baseProps} posts={[]} activeSport="all" isError onRetry={onRetry} />);
    expect(screen.queryByText('No posts yet for this sport.')).not.toBeInTheDocument();
    expect(screen.getByText("Couldn't load posts.")).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onRetry).toHaveBeenCalled();
  });

  it('shows a retry affordance in place of the load-more button when isLoadMoreError, keeping already-loaded posts visible', async () => {
    const user = userEvent.setup();
    const onLoadMore = vi.fn();
    render(
      <Feed
        {...baseProps}
        posts={posts}
        activeSport="all"
        hasMorePosts
        isLoadMoreError
        onLoadMore={onLoadMore}
      />,
    );
    expect(screen.getAllByRole('article')).toHaveLength(3);
    expect(screen.getByText("Couldn't load more posts.")).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Load more' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onLoadMore).toHaveBeenCalledTimes(1);
  });

  it('shows a "Load more" button when hasMorePosts, calling onLoadMore on click', async () => {
    const user = userEvent.setup();
    const onLoadMore = vi.fn();
    render(
      <Feed {...baseProps} posts={posts} activeSport="all" hasMorePosts onLoadMore={onLoadMore} />,
    );
    const button = screen.getByRole('button', { name: 'Load more' });
    await user.click(button);
    expect(onLoadMore).toHaveBeenCalledTimes(1);
  });

  it('disables the load-more button and shows a loading label while fetching the next page', () => {
    render(<Feed {...baseProps} posts={posts} activeSport="all" hasMorePosts isFetchingMorePosts />);
    const button = screen.getByRole('button', { name: 'Loading…' });
    expect(button).toBeDisabled();
  });

  it('does not render a load-more button when there is no next page', () => {
    render(<Feed {...baseProps} posts={posts} activeSport="all" hasMorePosts={false} />);
    expect(screen.queryByRole('button', { name: /load more/i })).not.toBeInTheDocument();
  });

  it('resolves each post’s sport badge via the real sportId, not a mock sport field', () => {
    render(<Feed {...baseProps} posts={posts} activeSport="all" />);
    expect(screen.getAllByText('Football')).toHaveLength(2);
    expect(screen.getAllByText('Basketball')).toHaveLength(1);
  });

  it('hides every post\'s sport badge when showSportBadge is false (Groups page)', () => {
    render(<Feed {...baseProps} posts={posts} activeSport="all" showSportBadge={false} />);
    expect(screen.queryByText('Football')).not.toBeInTheDocument();
    expect(screen.queryByText('Basketball')).not.toBeInTheDocument();
  });
});
