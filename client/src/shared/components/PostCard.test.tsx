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
        groupName={null}
        onToggleLike={noop}
        onHashtagClick={noop}
        onDeletePost={noop}
        onOpenComments={noop}
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
        groupName={null}
        onToggleLike={noop}
        onHashtagClick={noop}
        onDeletePost={noop}
        onOpenComments={noop}
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
        groupName={null}
        onToggleLike={noop}
        onHashtagClick={noop}
        onDeletePost={noop}
        onOpenComments={noop}
      />,
    );
    expect(screen.queryByText('Football')).not.toBeInTheDocument();
  });

  it('renders "username > groupname" when groupName is resolved (Home Feed / Groups "All")', () => {
    render(
      <PostCard
        post={{ ...post, postType: 'GROUP_POST', groupId: 7 }}
        sport={football}
        currentUserId="someone-else"
        groupName="1st Football"
        onToggleLike={noop}
        onHashtagClick={noop}
        onDeletePost={noop}
        onOpenComments={noop}
      />,
    );
    expect(screen.getByText('Marcus Lee')).toBeInTheDocument();
    expect(screen.getByText('1st Football')).toBeInTheDocument();
  });

  it('renders groupName as static text (no button) when onGroupClick is not provided', () => {
    render(
      <PostCard
        post={{ ...post, postType: 'GROUP_POST', groupId: 7 }}
        sport={football}
        currentUserId="someone-else"
        groupName="1st Football"
        onToggleLike={noop}
        onHashtagClick={noop}
        onDeletePost={noop}
        onOpenComments={noop}
      />,
    );
    expect(screen.queryByRole('button', { name: '1st Football' })).not.toBeInTheDocument();
  });

  it('renders groupName as a clickable link and reports the click when onGroupClick is provided', async () => {
    const user = userEvent.setup();
    const onGroupClick = vi.fn();
    render(
      <PostCard
        post={{ ...post, postType: 'GROUP_POST', groupId: 7 }}
        sport={football}
        currentUserId="someone-else"
        groupName="1st Football"
        onGroupClick={onGroupClick}
        onToggleLike={noop}
        onHashtagClick={noop}
        onDeletePost={noop}
        onOpenComments={noop}
      />,
    );
    await user.click(screen.getByRole('button', { name: '1st Football' }));
    expect(onGroupClick).toHaveBeenCalledTimes(1);
  });

  it('renders just the username when groupName is null (a specific group\'s own feed)', () => {
    render(
      <PostCard
        post={{ ...post, postType: 'GROUP_POST', groupId: 7 }}
        sport={football}
        currentUserId="someone-else"
        groupName={null}
        onToggleLike={noop}
        onHashtagClick={noop}
        onDeletePost={noop}
        onOpenComments={noop}
      />,
    );
    expect(screen.getByText('Marcus Lee')).toBeInTheDocument();
    expect(screen.queryByText(/>/)).not.toBeInTheDocument();
  });

  it('like button reports the post id and reflects the liked state from props', async () => {
    const user = userEvent.setup();
    const onToggleLike = vi.fn();
    const { rerender } = render(
      <PostCard
        post={post}
        sport={football}
        currentUserId="someone-else"
        groupName={null}
        onToggleLike={onToggleLike}
        onHashtagClick={noop}
        onDeletePost={noop}
        onOpenComments={noop}
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
        groupName={null}
        onToggleLike={onToggleLike}
        onHashtagClick={noop}
        onDeletePost={noop}
        onOpenComments={noop}
      />,
    );
    const unlikeButton = screen.getByRole('button', { name: 'Unlike' });
    expect(unlikeButton).toHaveAttribute('aria-pressed', 'true');
    expect(unlikeButton).toHaveTextContent('15');
  });

  it('renders a hashtag inline within the content as a clickable button (not a separate row)', async () => {
    const user = userEvent.setup();
    const onHashtagClick = vi.fn();
    render(
      <PostCard
        post={{ ...post, content: 'Great 5-a-side session tonight. #fridayrun' }}
        sport={football}
        currentUserId="someone-else"
        groupName={null}
        onToggleLike={noop}
        onHashtagClick={onHashtagClick}
        onDeletePost={noop}
        onOpenComments={noop}
      />,
    );
    const tag = screen.getByRole('button', { name: '#fridayrun' });
    expect(tag).toBeInTheDocument();
    await user.click(tag);
    expect(onHashtagClick).toHaveBeenCalledWith('#fridayrun');
  });

  it('renders content with no hashtags as plain text and no button', () => {
    render(
      <PostCard
        post={post}
        sport={football}
        currentUserId="someone-else"
        groupName={null}
        onToggleLike={noop}
        onHashtagClick={noop}
        onDeletePost={noop}
        onOpenComments={noop}
      />,
    );
    expect(screen.queryByRole('button', { name: /^#/ })).not.toBeInTheDocument();
  });

  it('disables the comment button for a GROUP_BROADCAST post; like stays functional (FEED-7)', async () => {
    const user = userEvent.setup();
    const onOpenComments = vi.fn();
    const onToggleLike = vi.fn();
    render(
      <PostCard
        post={{ ...post, postType: 'GROUP_BROADCAST', groupId: 5 }}
        sport={football}
        currentUserId="someone-else"
        groupName={null}
        onToggleLike={onToggleLike}
        onHashtagClick={noop}
        onDeletePost={noop}
        onOpenComments={onOpenComments}
      />,
    );
    expect(screen.getByRole('button', { name: 'View comments' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Like' }));
    expect(onToggleLike).toHaveBeenCalledWith(1);
  });

  it('comment button reports the post id (FEED-2 opens the comment dialog)', async () => {
    const user = userEvent.setup();
    const onOpenComments = vi.fn();
    render(
      <PostCard
        post={post}
        sport={football}
        currentUserId="someone-else"
        groupName={null}
        onToggleLike={noop}
        onHashtagClick={noop}
        onDeletePost={noop}
        onOpenComments={onOpenComments}
      />,
    );
    const commentButton = screen.getByRole('button', { name: 'View comments' });
    expect(commentButton).toHaveTextContent('3');
    await user.click(commentButton);
    expect(onOpenComments).toHaveBeenCalledWith(1);
  });

  it('shows no delete menu for another user’s post', () => {
    render(
      <PostCard
        post={post}
        sport={football}
        currentUserId="someone-else"
        groupName={null}
        onToggleLike={noop}
        onHashtagClick={noop}
        onDeletePost={noop}
        onOpenComments={noop}
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
        groupName={null}
        onToggleLike={noop}
        onHashtagClick={noop}
        onDeletePost={onDeletePost}
        onOpenComments={noop}
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
        groupName={null}
        onToggleLike={noop}
        onHashtagClick={noop}
        onDeletePost={noop}
        onOpenComments={noop}
      />,
    );
    expect(screen.queryByRole('button', { name: 'Post options' })).not.toBeInTheDocument();
  });
});
