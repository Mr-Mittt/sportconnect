import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Comment } from '@/features/feed/types';
import { SessionCommentSection } from './SessionCommentSection';

// CLIENT-GL-39: caller-only command notices and the rule that a reply never runs a command.

const comment: Comment = {
  id: 1,
  postId: 1,
  commentType: 'USER',
  userId: 'user-other',
  userFullName: 'Marcus Lee',
  userAvatarUrl: null,
  content: 'What time are we meeting?',
  parentCommentId: null,
  likeCount: 0,
  replyCount: 0,
  isLikedByCurrentUser: false,
  replies: [],
  createdAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
  updatedAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
};

const noop = () => {};
const baseProps = {
  currentUserId: 'user-me',
  currentUser: { fullName: 'Jordan Lee', avatarUrl: null },
  onAddComment: noop,
  comments: [comment],
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

describe('SessionCommentSection record commands', () => {
  it('shows the notices in the system-comment look, between the composer and the thread', () => {
    render(
      <SessionCommentSection
        {...baseProps}
        notices={[
          { id: 2, text: 'There is no game with id 99.' },
          { id: 1, text: 'Separate the two sides with “vs”.' },
        ]}
      />,
    );
    const box = screen.getByTestId('command-notices');
    const lines = within(box).getAllByRole('status');
    expect(lines.map((line) => line.textContent)).toEqual([
      'There is no game with id 99.',
      'Separate the two sides with “vs”.',
    ]);
    // the same italic muted line a stored system comment uses
    expect(within(box).getByText('There is no game with id 99.')).toHaveClass('italic', 'text-text-muted');
    const input = screen.getByRole('textbox', { name: 'Add a comment' });
    expect(input.compareDocumentPosition(box) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(box.compareDocumentPosition(screen.getByText('What time are we meeting?')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('shows no notice box when there are none', () => {
    render(<SessionCommentSection {...baseProps} />);
    expect(screen.queryByTestId('command-notices')).toBeNull();
  });

  it('never runs a command from a reply: the text goes to onAddReply as it is', async () => {
    const user = userEvent.setup();
    const run = vi.fn(() => ({ handled: true, accepted: true }));
    const onAddReply = vi.fn();
    render(
      <SessionCommentSection
        {...baseProps}
        onAddReply={onAddReply}
        commands={{ hints: [], mentions: [], run, isRunning: false }}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Reply' }));
    await user.type(
      screen.getByRole('textbox', { name: 'Reply to Marcus Lee' }),
      ':del 7{Enter}',
    );
    expect(onAddReply).toHaveBeenCalledWith(1, ':del 7');
    expect(run).not.toHaveBeenCalled();
  });
});
