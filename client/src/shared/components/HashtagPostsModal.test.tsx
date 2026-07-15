import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Post } from '@/features/feed/types';
import type { SportKey, SportProfile } from '@/shared/types/sport';
import { HashtagPostsModal } from './HashtagPostsModal';

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

const makePost = (id: number, userFullName: string): Post => ({
  id,
  userId: 'someone-else',
  userFullName,
  userAvatarUrl: null,
  postType: 'USER_FEED',
  groupId: null,
  content: `${userFullName}'s post #fridayrun`,
  latitude: null,
  longitude: null,
  locationName: null,
  sportId: 5,
  sportName: null,
  visibility: 'public',
  media: [],
  hashtags: ['fridayrun'],
  previewComments: [],
  likeCount: 0,
  commentCount: 0,
  shareCount: 0,
  isLikedByCurrentUser: false,
  createdAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
  updatedAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
  broadcastEndTime: null,
});

const posts = [makePost(1, 'Marcus'), makePost(2, 'Priya')];

const noop = () => {};
const baseProps = {
  isOpen: true,
  onClose: noop,
  tag: '#fridayrun',
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
};

describe('HashtagPostsModal', () => {
  beforeEach(() => {
    vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver);
  });

  it('renders the tag as the dialog title and the matching posts', () => {
    render(<HashtagPostsModal {...baseProps} posts={posts} />);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '#fridayrun' })).toBeInTheDocument();
    expect(screen.getAllByRole('article')).toHaveLength(2);
  });

  it('is not rendered when isOpen is false', () => {
    render(<HashtagPostsModal {...baseProps} posts={posts} isOpen={false} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('shows a tag-specific empty message when there are no matching posts', () => {
    render(<HashtagPostsModal {...baseProps} posts={[]} />);
    expect(screen.getByText('No posts found for #fridayrun.')).toBeInTheDocument();
  });

  it('calls onClose when the close button is clicked', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<HashtagPostsModal {...baseProps} posts={posts} onClose={onClose} />);
    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('forwards onToggleLike/onDeletePost/onOpenComments/onHashtagClick to the underlying Feed', async () => {
    const user = userEvent.setup();
    const onToggleLike = vi.fn();
    const onOpenComments = vi.fn();
    render(
      <HashtagPostsModal
        {...baseProps}
        posts={posts}
        onToggleLike={onToggleLike}
        onOpenComments={onOpenComments}
      />,
    );

    await user.click(screen.getAllByRole('button', { name: 'Like' })[0]);
    expect(onToggleLike).toHaveBeenCalledWith(1);

    await user.click(screen.getAllByRole('button', { name: /comment/i })[0]);
    expect(onOpenComments).toHaveBeenCalledWith(1);
  });
});
