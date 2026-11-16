import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Comment, Post } from '@/features/feed/types';
import type { SportProfile } from '@/shared/types/sport';
import { CommentSection } from './CommentSection';

function makeComment(overrides: Partial<Comment> = {}): Comment {
  return {
    id: 1,
    postId: 1,
    commentType: 'USER',
    userId: 'user-marcus',
    userFullName: 'Marcus Lee',
    userAvatarUrl: null,
    content: 'Great session!',
    parentCommentId: null,
    likeCount: 2,
    replyCount: 0,
    isLikedByCurrentUser: false,
    replies: [],
    createdAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    updatedAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    ...overrides,
  };
}

const post: Post = {
  id: 1,
  userId: 'user-marcus',
  userFullName: 'Marcus Lee',
  userAvatarUrl: null,
  postType: 'USER_FEED',
  groupId: null,
  content: 'Great 5-a-side session tonight!',
  latitude: null,
  longitude: null,
  locationName: null,
  sportId: 5,
  visibility: 'public',
  media: [],
  hashtags: [],
  previewComments: [],
  likeCount: 2,
  commentCount: 1,
  shareCount: 0,
  isLikedByCurrentUser: false,
  createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
  updatedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
  broadcastEndTime: null,
};

const football: SportProfile = {
  key: 'football',
  label: 'Football',
  iconUrl: '/images/sports/football.png',
  colorRamp: 'teal',
};

const currentUser = { fullName: 'Jordan Lee', avatarUrl: null };
const noop = () => {};
const baseProps = {
  isOpen: true,
  onClose: noop,
  currentUserId: 'user-marcus',
  currentUser,
  post,
  sport: football,
  isPostLoading: false,
  isPostError: false,
  comments: [] as Comment[],
  isLoading: false,
  isError: false,
  hasMore: false,
  isFetchingMore: false,
  onFetchMore: noop,
  onAddComment: noop,
  onAddReply: noop,
  isPosting: false,
  onDeleteComment: noop,
  onToggleCommentLike: noop,
  onHashtagClick: noop,
  onTogglePostLike: noop,
};


describe('CommentSection: closing over an unsent comment or reply (owner, 2026-11-16)', () => {
  const asked = () => screen.queryByText('Leave without posting?');

  it('closes at once when nothing is typed', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<CommentSection {...baseProps} onClose={onClose} />);
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(asked()).not.toBeInTheDocument();
  });

  it('asks first when a comment is typed; Keep editing stays, Leave closes', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<CommentSection {...baseProps} onClose={onClose} />);
    await user.type(screen.getByRole('textbox', { name: /comment/i }), 'half');

    await user.keyboard('{Escape}');
    expect(await screen.findByText('Leave without posting?')).toBeInTheDocument();
    expect(screen.getByText('You have an unsent comment. Leaving now will lose what you typed.')).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Keep editing' }));
    expect(asked()).not.toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('textbox', { name: /comment/i })).toHaveTextContent('half');

    await user.click(screen.getByRole('button', { name: 'Close' }));
    await user.click(await screen.findByRole('button', { name: 'Leave' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('asks first when a reply is typed', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<CommentSection {...baseProps} comments={[makeComment()]} onClose={onClose} />);
    await user.click(screen.getByRole('button', { name: 'Reply' }));
    await user.type(screen.getByRole('textbox', { name: /reply/i }), 'half');

    await user.keyboard('{Escape}');
    expect(await screen.findByText('Leave without posting?')).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('"Keep editing" puts the caret on the unsent text: the first of them when there are several', async () => {
    const user = userEvent.setup();
    render(<CommentSection {...baseProps} comments={[makeComment()]} />);
    await user.click(screen.getByRole('button', { name: 'Reply' }));
    await user.type(screen.getByRole('textbox', { name: /reply/i }), 'reply half');

    // only the reply holds text: it gets the caret
    await user.keyboard('{Escape}');
    await user.click(await screen.findByRole('button', { name: 'Keep editing' }));
    await waitFor(() => expect(screen.getByRole('textbox', { name: /reply/i })).toHaveFocus());

    // the comment box (first in the dialog) holds text too: it comes first
    await user.type(screen.getByRole('textbox', { name: 'Add a comment' }), 'comment half');
    await user.keyboard('{Escape}');
    await user.click(await screen.findByRole('button', { name: 'Keep editing' }));
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Add a comment' })).toHaveFocus());
  });

  it('does not ask once the reply box was closed empty', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<CommentSection {...baseProps} comments={[makeComment()]} onClose={onClose} />);
    await user.click(screen.getByRole('button', { name: 'Reply' }));
    await user.click(screen.getByRole('button', { name: /cancel reply/i }));
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
