import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Comment } from '@/features/feed/types';
import { CommentItem } from './CommentItem';

function makeComment(overrides: Partial<Comment> = {}): Comment {
  return {
    id: 1,
    postId: 1,
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

const noop = () => {};

describe('CommentItem', () => {
  it('renders author, relative time, content, and initials', () => {
    render(
      <CommentItem
        comment={makeComment()}
        currentUserId="someone-else"
        onToggleLike={noop}
        onDelete={noop}
        onReply={noop}
        isSubmittingReply={false}
      />,
    );
    expect(screen.getByText('Marcus Lee')).toBeInTheDocument();
    expect(screen.getByText('1h ago')).toBeInTheDocument();
    expect(screen.getByText('Great session!')).toBeInTheDocument();
    expect(screen.getByText('ML')).toBeInTheDocument();
  });

  it('like button reports the comment and reflects liked state from props', async () => {
    const user = userEvent.setup();
    const onToggleLike = vi.fn();
    const comment = makeComment();
    render(
      <CommentItem
        comment={comment}
        currentUserId="someone-else"
        onToggleLike={onToggleLike}
        onDelete={noop}
        onReply={noop}
        isSubmittingReply={false}
      />,
    );
    const likeButton = screen.getByRole('button', { name: 'Like comment' });
    expect(likeButton).toHaveTextContent('2');
    await user.click(likeButton);
    expect(onToggleLike).toHaveBeenCalledWith(comment);
  });

  it('shows the delete button only for the caller’s own comment', () => {
    const { rerender } = render(
      <CommentItem
        comment={makeComment({ userId: 'someone-else' })}
        currentUserId="user-marcus"
        onToggleLike={noop}
        onDelete={noop}
        onReply={noop}
        isSubmittingReply={false}
      />,
    );
    expect(screen.queryByRole('button', { name: 'Delete comment' })).not.toBeInTheDocument();

    rerender(
      <CommentItem
        comment={makeComment({ userId: 'user-marcus' })}
        currentUserId="user-marcus"
        onToggleLike={noop}
        onDelete={noop}
        onReply={noop}
        isSubmittingReply={false}
      />,
    );
    expect(screen.getByRole('button', { name: 'Delete comment' })).toBeInTheDocument();
  });

  it('delete button reports the comment', async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn();
    const comment = makeComment({ userId: 'user-marcus' });
    render(
      <CommentItem
        comment={comment}
        currentUserId="user-marcus"
        onToggleLike={noop}
        onDelete={onDelete}
        onReply={noop}
        isSubmittingReply={false}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Delete comment' }));
    expect(onDelete).toHaveBeenCalledWith(comment);
  });

  it('shows Reply for a root comment and opens/submits a reply composer', async () => {
    const user = userEvent.setup();
    const onReply = vi.fn();
    render(
      <CommentItem
        comment={makeComment({ id: 5 })}
        currentUserId="someone-else"
        onToggleLike={noop}
        onDelete={noop}
        onReply={onReply}
        isSubmittingReply={false}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Reply' }));
    const input = screen.getByRole('textbox', { name: 'Reply to Marcus Lee' });
    await user.type(input, 'Nice one!');
    await user.click(screen.getByRole('button', { name: 'Post' }));
    expect(onReply).toHaveBeenCalledWith(5, 'Nice one!');
  });

  it('does not show Reply for a comment that is itself a reply', () => {
    render(
      <CommentItem
        comment={makeComment({ parentCommentId: 1 })}
        currentUserId="someone-else"
        onToggleLike={noop}
        onDelete={noop}
        onReply={noop}
        isSubmittingReply={false}
      />,
    );
    expect(screen.queryByRole('button', { name: 'Reply' })).not.toBeInTheDocument();
  });

  it('renders nested replies recursively, without their own Reply button', () => {
    const comment = makeComment({
      id: 1,
      replies: [
        makeComment({ id: 2, userFullName: 'Priya Shah', parentCommentId: 1, content: 'Agreed!' }),
      ],
    });
    render(
      <CommentItem
        comment={comment}
        currentUserId="someone-else"
        onToggleLike={noop}
        onDelete={noop}
        onReply={noop}
        isSubmittingReply={false}
      />,
    );
    expect(screen.getByText('Priya Shah')).toBeInTheDocument();
    expect(screen.getByText('Agreed!')).toBeInTheDocument();
    // Only the root comment gets a Reply button, not its nested reply.
    expect(screen.getAllByRole('button', { name: 'Reply' })).toHaveLength(1);
  });
});
