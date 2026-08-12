import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Comment } from '@/features/feed/types';
import { SessionCommentSection } from './SessionCommentSection';

function makeComment(overrides: Partial<Comment> = {}): Comment {
  return {
    id: 1,
    postId: 1,
    userId: 'user-marcus',
    userFullName: 'Marcus Lee',
    userAvatarUrl: null,
    content: 'What time are we meeting?',
    parentCommentId: null,
    likeCount: 1,
    replyCount: 0,
    isLikedByCurrentUser: false,
    replies: [],
    createdAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    updatedAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    ...overrides,
  };
}

const currentUser = { fullName: 'Jordan Lee', avatarUrl: null };
const noop = () => {};
const baseProps = {
  currentUserId: 'user-marcus',
  currentUser,
  likeCount: 0,
  isLikedByCurrentUser: false,
  onToggleLike: noop,
  isTogglingLike: false,
  comments: [] as Comment[],
  isLoading: false,
  isError: false,
  isForbidden: false,
  hasMore: false,
  isFetchingMore: false,
  onFetchMore: noop,
  onAddComment: noop,
  onAddReply: noop,
  isPosting: false,
  onDeleteComment: noop,
  onToggleCommentLike: noop,
};

describe('SessionCommentSection', () => {
  it('renders nothing when isForbidden', () => {
    const { container } = render(<SessionCommentSection {...baseProps} isForbidden />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the empty state for a thread with zero comments', () => {
    render(<SessionCommentSection {...baseProps} />);
    expect(screen.getByText('No comments yet. Be the first to comment!')).toBeInTheDocument();
  });

  it('shows a loading state while isLoading', () => {
    render(<SessionCommentSection {...baseProps} isLoading />);
    expect(screen.getByText('Loading comments…')).toBeInTheDocument();
    expect(screen.queryByText('No comments yet. Be the first to comment!')).not.toBeInTheDocument();
  });

  it('shows an error message when isError', () => {
    render(<SessionCommentSection {...baseProps} isError />);
    expect(screen.getByText("Couldn't load comments.")).toBeInTheDocument();
  });

  it('renders comments, including nested replies, as plain text (no hashtag linking)', () => {
    render(
      <SessionCommentSection
        {...baseProps}
        comments={[
          makeComment({
            content: 'Bring your own #paddle',
            replies: [
              makeComment({ id: 2, userFullName: 'Priya Shah', content: 'Agreed!', parentCommentId: 1 }),
            ],
          }),
        ]}
      />,
    );
    expect(screen.getByText('Agreed!')).toBeInTheDocument();
    expect(screen.getByText('Bring your own #paddle')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '#paddle' })).not.toBeInTheDocument();
  });

  it('shows "View more comments" when hasMore, calling onFetchMore on click', async () => {
    const user = userEvent.setup();
    const onFetchMore = vi.fn();
    render(
      <SessionCommentSection
        {...baseProps}
        comments={[makeComment()]}
        hasMore
        onFetchMore={onFetchMore}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'View more comments' }));
    expect(onFetchMore).toHaveBeenCalledTimes(1);
  });

  it('submits a new comment via the composer and clears it', async () => {
    const user = userEvent.setup();
    const onAddComment = vi.fn();
    render(<SessionCommentSection {...baseProps} onAddComment={onAddComment} />);
    const input = screen.getByRole('textbox', { name: 'Add a comment' });
    await user.type(input, 'Nice one!');
    await user.click(screen.getByRole('button', { name: 'Post' }));
    expect(onAddComment).toHaveBeenCalledWith('Nice one!');
    expect(input).toHaveValue('');
  });

  it('Post button stays disabled while the composer is empty, solid once there is text', async () => {
    const user = userEvent.setup();
    render(<SessionCommentSection {...baseProps} />);
    const postBtn = screen.getByRole('button', { name: 'Post' });
    expect(postBtn).toBeDisabled();
    await user.type(screen.getByRole('textbox', { name: 'Add a comment' }), 'x');
    expect(postBtn).not.toBeDisabled();
  });

  it('reply/delete/like on a comment call through to their handlers', async () => {
    const user = userEvent.setup();
    const onToggleCommentLike = vi.fn();
    const onDeleteComment = vi.fn();
    const comment = makeComment();
    render(
      <SessionCommentSection
        {...baseProps}
        comments={[comment]}
        onToggleCommentLike={onToggleCommentLike}
        onDeleteComment={onDeleteComment}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Like comment' }));
    expect(onToggleCommentLike).toHaveBeenCalledWith(comment);
    await user.click(screen.getByRole('button', { name: 'Delete comment' }));
    expect(onDeleteComment).toHaveBeenCalledWith(comment);
  });

  it('submits a reply via the reply box (distinct from the main composer\'s own Post button)', async () => {
    const user = userEvent.setup();
    const onAddReply = vi.fn();
    const onAddComment = vi.fn();
    const comment = makeComment();
    render(
      <SessionCommentSection
        {...baseProps}
        comments={[comment]}
        onAddReply={onAddReply}
        onAddComment={onAddComment}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Reply' }));
    await user.type(screen.getByRole('textbox', { name: `Reply to ${comment.userFullName}` }), 'Sounds good');
    // Two "Post" buttons exist simultaneously here: the reply box's own, and the main composer's
    // (always rendered below the list) — the reply's is the first in DOM order.
    const postButtons = screen.getAllByRole('button', { name: 'Post' });
    expect(postButtons).toHaveLength(2);
    await user.click(postButtons[0]);
    expect(onAddReply).toHaveBeenCalledWith(comment.id, 'Sounds good');
    expect(onAddComment).not.toHaveBeenCalled();
  });

  it('renders a heart button above the thread reflecting like state and calling onToggleLike', async () => {
    const user = userEvent.setup();
    const onToggleLike = vi.fn();
    const { rerender } = render(
      <SessionCommentSection {...baseProps} likeCount={2} isLikedByCurrentUser={false} onToggleLike={onToggleLike} />,
    );

    const likeButton = screen.getByRole('button', { name: 'Like' });
    expect(likeButton).toHaveTextContent('2');
    await user.click(likeButton);
    expect(onToggleLike).toHaveBeenCalledTimes(1);

    rerender(
      <SessionCommentSection {...baseProps} likeCount={3} isLikedByCurrentUser onToggleLike={onToggleLike} />,
    );
    const unlikeButton = screen.getByRole('button', { name: 'Unlike' });
    expect(unlikeButton).toHaveAttribute('aria-pressed', 'true');
    expect(unlikeButton).toHaveTextContent('3');
  });

  it('disables the heart button while isTogglingLike', () => {
    render(<SessionCommentSection {...baseProps} isTogglingLike />);
    expect(screen.getByRole('button', { name: 'Like' })).toBeDisabled();
  });

  it('renders no visible "Discussion" text — the section is named via aria-label only', () => {
    render(<SessionCommentSection {...baseProps} />);
    expect(screen.queryByText('Discussion')).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Discussion' })).toBeInTheDocument();
  });
});
