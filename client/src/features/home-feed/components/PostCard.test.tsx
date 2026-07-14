import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Post } from '@/features/feed/types';
import type { SportProfile } from '@/shared/types/sport';
import { PostCard } from './PostCard';

const football: SportProfile = {
  key: 'football',
  label: 'Football',
  icon: 'ball-football',
  colorRamp: 'teal',
};

const post: Post = {
  id: 1,
  userId: 'user-marcus',
  userFullName: 'Marcus Lee',
  userAvatarUrl: null,
  postType: 'USER_FEED',
  groupId: null,
  content: 'Great 5-a-side session tonight.',
  latitude: null,
  longitude: null,
  locationName: null,
  sportId: 5,
  sportName: 'Soccer',
  visibility: 'public',
  media: [],
  hashtags: ['5aside', 'fridayrun'],
  previewComments: [],
  likeCount: 14,
  commentCount: 3,
  shareCount: 0,
  isLikedByCurrentUser: false,
  createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
  updatedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
  broadcastEndTime: null,
};

const noop = () => {};

describe('PostCard', () => {
  it('renders author, computed relative time, sport badge, and body', () => {
    render(
      <PostCard
        post={post}
        sport={football}
        currentUserId="someone-else"
        onToggleLike={noop}
        onHashtagClick={noop}
        onDeletePost={noop}
      />,
    );
    expect(screen.getByText('Marcus Lee')).toBeInTheDocument();
    expect(screen.getByText('2h ago')).toBeInTheDocument(); // computed from createdAt, not stored
    expect(screen.getByText('Football')).toBeInTheDocument();
    expect(screen.getByText('Great 5-a-side session tonight.')).toBeInTheDocument();
    expect(screen.getByText('ML')).toBeInTheDocument(); // initials derived from userFullName
  });

  it('falls back to "Unknown User" and blank initials when userFullName is null', () => {
    render(
      <PostCard
        post={{ ...post, userFullName: null }}
        sport={football}
        currentUserId="someone-else"
        onToggleLike={noop}
        onHashtagClick={noop}
        onDeletePost={noop}
      />,
    );
    expect(screen.getByText('Unknown User')).toBeInTheDocument();
  });

  it('renders no sport badge when sport is null', () => {
    render(
      <PostCard
        post={post}
        sport={null}
        currentUserId="someone-else"
        onToggleLike={noop}
        onHashtagClick={noop}
        onDeletePost={noop}
      />,
    );
    expect(screen.queryByText('Football')).not.toBeInTheDocument();
  });

  it('like button reports the post id and reflects the liked state from props', async () => {
    const user = userEvent.setup();
    const onToggleLike = vi.fn();
    const { rerender } = render(
      <PostCard
        post={post}
        sport={football}
        currentUserId="someone-else"
        onToggleLike={onToggleLike}
        onHashtagClick={noop}
        onDeletePost={noop}
      />,
    );

    const likeButton = screen.getByRole('button', { name: 'Like' });
    expect(likeButton).toHaveAttribute('aria-pressed', 'false');
    expect(likeButton).toHaveTextContent('14');
    await user.click(likeButton);
    expect(onToggleLike).toHaveBeenCalledWith(1);

    // Controlled: the liked rendering follows props (parent owns the state)
    rerender(
      <PostCard
        post={{ ...post, isLikedByCurrentUser: true, likeCount: 15 }}
        sport={football}
        currentUserId="someone-else"
        onToggleLike={onToggleLike}
        onHashtagClick={noop}
        onDeletePost={noop}
      />,
    );
    const unlikeButton = screen.getByRole('button', { name: 'Unlike' });
    expect(unlikeButton).toHaveAttribute('aria-pressed', 'true');
    expect(unlikeButton).toHaveTextContent('15');
  });

  it('hashtags render with a # prefix and report the tag with # on click', async () => {
    const user = userEvent.setup();
    const onHashtagClick = vi.fn();
    render(
      <PostCard
        post={post}
        sport={football}
        currentUserId="someone-else"
        onToggleLike={noop}
        onHashtagClick={onHashtagClick}
        onDeletePost={noop}
      />,
    );
    const tag = screen.getByRole('button', { name: '#fridayrun' });
    expect(tag).toBeInTheDocument();
    await user.click(tag);
    expect(onHashtagClick).toHaveBeenCalledWith('#fridayrun');
  });

  it('comment count is display-only (not a button)', () => {
    render(
      <PostCard
        post={post}
        sport={football}
        currentUserId="someone-else"
        onToggleLike={noop}
        onHashtagClick={noop}
        onDeletePost={noop}
      />,
    );
    const buttons = screen.getAllByRole('button').map((b) => b.textContent);
    expect(buttons).not.toContain('3');
  });

  it('shows no delete menu for another user’s post', () => {
    render(
      <PostCard
        post={post}
        sport={football}
        currentUserId="someone-else"
        onToggleLike={noop}
        onHashtagClick={noop}
        onDeletePost={noop}
      />,
    );
    expect(screen.queryByRole('button', { name: 'Post options' })).not.toBeInTheDocument();
  });

  it('shows the delete menu for the caller’s own post and calls onDeletePost on selection', async () => {
    const user = userEvent.setup();
    const onDeletePost = vi.fn();
    render(
      <PostCard
        post={post}
        sport={football}
        currentUserId="user-marcus"
        onToggleLike={noop}
        onHashtagClick={noop}
        onDeletePost={onDeletePost}
      />,
    );

    const menuTrigger = screen.getByRole('button', { name: 'Post options' });
    await user.click(menuTrigger);

    const deleteItem = await screen.findByText('Delete post');
    await user.click(deleteItem);
    expect(onDeletePost).toHaveBeenCalledWith(1);
  });

  it('shows no delete menu when currentUserId is undefined (session not yet resolved)', () => {
    render(
      <PostCard
        post={post}
        sport={football}
        currentUserId={undefined}
        onToggleLike={noop}
        onHashtagClick={noop}
        onDeletePost={noop}
      />,
    );
    expect(screen.queryByRole('button', { name: 'Post options' })).not.toBeInTheDocument();
  });
});
