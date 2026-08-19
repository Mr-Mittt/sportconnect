import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Comment } from '@/features/feed/types';
import { SessionCommentSection } from './SessionCommentSection';

function makeComment(overrides: Partial<Comment> = {}): Comment {
  return {
    id: 1,
    postId: 1,
    commentType: 'USER',
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

const noop = () => {};
const baseProps = {
  currentUserId: 'user-marcus',
  comments: [] as Comment[],
  isLoading: false,
  isError: false,
  isForbidden: false,
  hasMore: false,
  isFetchingMore: false,
  onFetchMore: noop,
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

    await user.click(screen.getByRole('button', { name: 'Comment options' }));
    await user.click(await screen.findByText('Delete'));
    expect(onDeleteComment).toHaveBeenCalledWith(comment);
  });

  it('submits a reply via the reply box', async () => {
    const user = userEvent.setup();
    const onAddReply = vi.fn();
    const comment = makeComment();
    render(<SessionCommentSection {...baseProps} comments={[comment]} onAddReply={onAddReply} />);
    await user.click(screen.getByRole('button', { name: 'Reply' }));
    await user.type(screen.getByRole('textbox', { name: `Reply to ${comment.userFullName}` }), 'Sounds good');
    // CLIENT-SESSION-10: the main composer moved out of this component (now `SessionCommentComposer`,
    // rendered by SessionDetailModal) — the reply box's own "Post" is the only one here now.
    await user.click(screen.getByRole('button', { name: 'Post' }));
    expect(onAddReply).toHaveBeenCalledWith(comment.id, 'Sounds good');
  });

  it('renders no visible "Discussion" text — the section is named via aria-label only', () => {
    render(<SessionCommentSection {...baseProps} />);
    expect(screen.queryByText('Discussion')).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Discussion' })).toBeInTheDocument();
  });

  // CLIENT-SESSION-13. A session that has started but has no human comments is a real and
  // probably common state — the thread must show its system entries, not the empty copy.
  // This works because system entries *are* comments (so `comments.length === 0` is false),
  // but that's an implicit consequence worth pinning down: an implementation that filtered
  // system entries out before the length check would silently regress it.
  it('renders a system-only thread rather than the empty state', () => {
    const systemComment = makeComment({
      id: 9,
      commentType: 'SESSION_SYSTEM',
      content: 'The session has started',
    });
    render(<SessionCommentSection {...baseProps} comments={[systemComment]} />);
    expect(screen.getByText('The session has started')).toBeInTheDocument();
    expect(screen.queryByText('No comments yet. Be the first to comment!')).not.toBeInTheDocument();
  });

  it('renders a mixed thread with both kinds in order', () => {
    const userComment = makeComment({ id: 1, content: 'What time are we meeting?' });
    const systemComment = makeComment({
      id: 2,
      commentType: 'SESSION_SYSTEM',
      content: 'Priya Shah joined the session',
    });
    render(<SessionCommentSection {...baseProps} comments={[userComment, systemComment]} />);
    expect(screen.getByText('What time are we meeting?')).toBeInTheDocument();
    expect(screen.getByText('Priya Shah joined the session')).toBeInTheDocument();
    // Only the user comment carries affordances.
    expect(screen.getAllByRole('button', { name: /like comment/i })).toHaveLength(1);
  });
});
