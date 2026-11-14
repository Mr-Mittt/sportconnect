import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Comment } from '@/features/feed/types';
import { CommentItem } from './CommentItem';

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
        onHashtagClick={noop}
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
        onHashtagClick={noop}
      />,
    );
    const likeButton = screen.getByRole('button', { name: 'Like comment' });
    expect(likeButton).toHaveTextContent('2');
    await user.click(likeButton);
    expect(onToggleLike).toHaveBeenCalledWith(comment);
  });

  it('shows the "..." options menu only for the caller’s own comment', () => {
    const { rerender } = render(
      <CommentItem
        comment={makeComment({ userId: 'someone-else' })}
        currentUserId="user-marcus"
        onToggleLike={noop}
        onDelete={noop}
        onReply={noop}
        isSubmittingReply={false}
        onHashtagClick={noop}
      />,
    );
    expect(screen.queryByRole('button', { name: 'Comment options' })).not.toBeInTheDocument();

    rerender(
      <CommentItem
        comment={makeComment({ userId: 'user-marcus' })}
        currentUserId="user-marcus"
        onToggleLike={noop}
        onDelete={noop}
        onReply={noop}
        isSubmittingReply={false}
        onHashtagClick={noop}
      />,
    );
    expect(screen.getByRole('button', { name: 'Comment options' })).toBeInTheDocument();
  });

  it('options menu: Delete reports the comment, Edit is present but disabled (no backend endpoint yet)', async () => {
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
        onHashtagClick={noop}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Comment options' }));

    const editItem = await screen.findByText('Edit');
    expect(editItem.closest('[role="menuitem"]')).toHaveAttribute('data-disabled');

    await user.click(screen.getByText('Delete'));
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
        onHashtagClick={noop}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Reply' }));
    const input = screen.getByRole('textbox', { name: 'Reply to Marcus Lee' });
    await user.type(input, 'Nice one!');
    await user.click(screen.getByRole('button', { name: 'Post' }));
    expect(onReply).toHaveBeenCalledWith(5, 'Nice one!');
  });

  describe('the reply composer', () => {
    const box = () => screen.queryByRole('textbox', { name: 'Reply to Marcus Lee' });

    it('opens focused and shows the current user avatar', async () => {
      const user = userEvent.setup();
      render(
        <CommentItem
          comment={makeComment({ id: 5 })}
          currentUserId="someone-else"
          currentUser={{ fullName: 'Priya Shah', avatarUrl: null }}
          onToggleLike={noop}
          onDelete={noop}
          onReply={noop}
          isSubmittingReply={false}
          onHashtagClick={noop}
        />,
      );
      await user.click(screen.getByRole('button', { name: 'Reply' }));
      expect(box()).toHaveFocus();
      expect(screen.getByText('PS')).toBeInTheDocument();
    });

    it('closes when focus leaves it before anything was typed', async () => {
      const user = userEvent.setup();
      render(
        <CommentItem
          comment={makeComment({ id: 5 })}
          currentUserId="someone-else"
          currentUser={{ fullName: 'Priya Shah', avatarUrl: null }}
          onToggleLike={noop}
          onDelete={noop}
          onReply={noop}
          isSubmittingReply={false}
          onHashtagClick={noop}
        />,
      );
      await user.click(screen.getByRole('button', { name: 'Reply' }));
      await user.click(document.body);
      expect(box()).toBeNull();
    });

    it('stays open after leaving it once something was typed, even when it was cleared again', async () => {
      const user = userEvent.setup();
      render(
        <CommentItem
          comment={makeComment({ id: 5 })}
          currentUserId="someone-else"
          currentUser={{ fullName: 'Priya Shah', avatarUrl: null }}
          onToggleLike={noop}
          onDelete={noop}
          onReply={noop}
          isSubmittingReply={false}
          onHashtagClick={noop}
        />,
      );
      await user.click(screen.getByRole('button', { name: 'Reply' }));
      await user.type(box() as HTMLElement, 'a');
      await user.clear(box() as HTMLElement);
      await user.click(document.body);
      expect(box()).not.toBeNull();
    });

    it('has a red X that closes it while empty, and the send button once there is text', async () => {
      const user = userEvent.setup();
      render(
        <CommentItem
          comment={makeComment({ id: 5 })}
          currentUserId="someone-else"
          currentUser={{ fullName: 'Priya Shah', avatarUrl: null }}
          onToggleLike={noop}
          onDelete={noop}
          onReply={noop}
          isSubmittingReply={false}
          onHashtagClick={noop}
        />,
      );
      await user.click(screen.getByRole('button', { name: 'Reply' }));
      expect(screen.queryByRole('button', { name: 'Post' })).toBeNull();
      const cancel = screen.getByRole('button', { name: 'Cancel reply' });
      expect(cancel).toHaveClass('text-text-danger');
      await user.type(box() as HTMLElement, 'x');
      expect(screen.queryByRole('button', { name: 'Cancel reply' })).toBeNull();
      expect(screen.getByRole('button', { name: 'Post' })).toHaveClass('rounded-full');
      await user.clear(box() as HTMLElement);
      await user.click(screen.getByRole('button', { name: 'Cancel reply' }));
      expect(box()).toBeNull();
    });

    it('sends on Enter', async () => {
      const user = userEvent.setup();
      const onReply = vi.fn();
      render(
        <CommentItem
          comment={makeComment({ id: 5 })}
          currentUserId="someone-else"
          currentUser={{ fullName: 'Priya Shah', avatarUrl: null }}
          onToggleLike={noop}
          onDelete={noop}
          onReply={onReply}
          isSubmittingReply={false}
          onHashtagClick={noop}
        />,
      );
      await user.click(screen.getByRole('button', { name: 'Reply' }));
      await user.type(box() as HTMLElement, 'On enter{Enter}');
      expect(onReply).toHaveBeenCalledWith(5, 'On enter');
      expect(box()).toBeNull();
    });
  });

  it('shows the full date and time of the comment on hover of its timestamp', () => {
    render(
      <CommentItem
        comment={makeComment({ createdAt: '2026-03-05T14:30:00Z' })}
        currentUserId="someone-else"
        onToggleLike={noop}
        onDelete={noop}
        onReply={noop}
        isSubmittingReply={false}
        onHashtagClick={noop}
      />,
    );
    const title =
      screen.getByText(/ago|now|on/i, { selector: 'span[title]' }).getAttribute('title') ?? '';
    expect(title).toMatch(/2026/);
    expect(title).toMatch(/Mar/);
  });

  it('shows the like count right after the timestamp', () => {
    render(
      <CommentItem
        comment={makeComment({ id: 5 })}
        currentUserId="someone-else"
        currentUser={{ fullName: 'Priya Shah', avatarUrl: null }}
        onToggleLike={noop}
        onDelete={noop}
        onReply={noop}
        isSubmittingReply={false}
        onHashtagClick={noop}
      />,
    );
    const like = screen.getByRole('button', { name: 'Like comment' });
    const time = screen.getByText(/ago|now/i);
    expect(time.compareDocumentPosition(like) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(time.parentElement).toContainElement(like);
    expect(screen.getByRole('button', { name: 'Reply' }).parentElement).not.toContainElement(like);
  });

  it('lists the replies newest first', () => {
    const at = (minutesAgo: number) => new Date(Date.now() - minutesAgo * 60 * 1000).toISOString();
    render(
      <CommentItem
        comment={makeComment({
          id: 1,
          replies: [
            makeComment({ id: 2, parentCommentId: 1, content: 'oldest reply', createdAt: at(30) }),
            makeComment({ id: 4, parentCommentId: 1, content: 'newest reply', createdAt: at(5) }),
            makeComment({ id: 3, parentCommentId: 1, content: 'middle reply', createdAt: at(15) }),
          ],
        })}
        currentUserId="someone-else"
        onToggleLike={noop}
        onDelete={noop}
        onReply={noop}
        isSubmittingReply={false}
        onHashtagClick={noop}
      />,
    );
    const order = ['newest reply', 'middle reply', 'oldest reply'].map((text) =>
      screen.getByText(text),
    );
    expect(
      order[0].compareDocumentPosition(order[1]) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      order[1].compareDocumentPosition(order[2]) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
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
        onHashtagClick={noop}
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
        onHashtagClick={noop}
      />,
    );
    expect(screen.getByText('Priya Shah')).toBeInTheDocument();
    expect(screen.getByText('Agreed!')).toBeInTheDocument();
    // Only the root comment gets a Reply button, not its nested reply.
    expect(screen.getAllByRole('button', { name: 'Reply' })).toHaveLength(1);
  });

  it('renders a hashtag inside comment content as a clickable button', async () => {
    const user = userEvent.setup();
    const onHashtagClick = vi.fn();
    render(
      <CommentItem
        comment={makeComment({ content: 'Same time next week? #fridayrun' })}
        currentUserId="someone-else"
        onToggleLike={noop}
        onDelete={noop}
        onReply={noop}
        isSubmittingReply={false}
        onHashtagClick={onHashtagClick}
      />,
    );
    await user.click(screen.getByRole('button', { name: '#fridayrun' }));
    expect(onHashtagClick).toHaveBeenCalledWith('#fridayrun');
  });

  it('passes onHashtagClick down to nested replies too', async () => {
    const user = userEvent.setup();
    const onHashtagClick = vi.fn();
    const comment = makeComment({
      id: 1,
      replies: [
        makeComment({
          id: 2,
          userFullName: 'Priya Shah',
          parentCommentId: 1,
          content: 'Same tag: #fridayrun',
        }),
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
        onHashtagClick={onHashtagClick}
      />,
    );
    await user.click(screen.getByRole('button', { name: '#fridayrun' }));
    expect(onHashtagClick).toHaveBeenCalledWith('#fridayrun');
  });

  // CLIENT-SESSION-13 — SESSION_SYSTEM entries.
  describe('a SESSION_SYSTEM comment', () => {
    const systemComment = () =>
      makeComment({
        commentType: 'SESSION_SYSTEM',
        content: 'Priya Shah joined the session',
        userFullName: 'Priya Shah',
      });

    it('renders the server-templated content verbatim', () => {
      render(
        <CommentItem
          comment={systemComment()}
          currentUserId="someone-else"
          onToggleLike={noop}
          onDelete={noop}
          onReply={noop}
          isSubmittingReply={false}
        />,
      );
      expect(screen.getByText('Priya Shah joined the session')).toBeInTheDocument();
    });

    it('offers no like, reply, or options control — the server rejects all three on a system entry', () => {
      render(
        <CommentItem
          comment={systemComment()}
          currentUserId="someone-else"
          onToggleLike={noop}
          onDelete={noop}
          onReply={noop}
          isSubmittingReply={false}
        />,
      );
      expect(screen.queryByRole('button', { name: /like comment/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Reply' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Comment options' })).not.toBeInTheDocument();
    });

    it('shows no options menu even when the caller is the nominal author (the session creator)', () => {
      // SESSION-21 authors system entries as `session.getCreatedBy()`, so the creator viewing
      // their own session would otherwise pass CommentItem's `isOwnComment` check and be
      // offered Delete — which `deleteComment` rejects before the ownership check.
      const comment = systemComment();
      render(
        <CommentItem
          comment={comment}
          currentUserId={comment.userId}
          onToggleLike={noop}
          onDelete={noop}
          onReply={noop}
          isSubmittingReply={false}
        />,
      );
      expect(screen.queryByRole('button', { name: 'Comment options' })).not.toBeInTheDocument();
    });

    it('does not render an author name or avatar initials — it must not read as that person speaking', () => {
      render(
        <CommentItem
          comment={systemComment()}
          currentUserId="someone-else"
          onToggleLike={noop}
          onDelete={noop}
          onReply={noop}
          isSubmittingReply={false}
        />,
      );
      // The name appears only inside the server-templated sentence, never as a separate byline.
      expect(screen.queryByText('Priya Shah')).not.toBeInTheDocument();
      expect(screen.queryByText('PS')).not.toBeInTheDocument();
    });

    it('leaves a USER comment completely unaffected', () => {
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
      expect(screen.getByRole('button', { name: /like comment/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Reply' })).toBeInTheDocument();
    });
  });
});
