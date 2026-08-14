import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SessionCommentComposer } from './SessionCommentComposer';

const baseProps = {
  currentUser: { fullName: 'Jordan Lee', avatarUrl: null },
  onAddComment: () => {},
  isPosting: false,
};

describe('SessionCommentComposer', () => {
  it('submits a new comment and clears the input', async () => {
    const user = userEvent.setup();
    const onAddComment = vi.fn();
    render(<SessionCommentComposer {...baseProps} onAddComment={onAddComment} />);
    const input = screen.getByRole('textbox', { name: 'Add a comment' });
    await user.type(input, 'Nice one!');
    await user.click(screen.getByRole('button', { name: 'Post comment' }));
    expect(onAddComment).toHaveBeenCalledWith('Nice one!');
    expect(input).toHaveValue('');
  });

  it('submits on Enter', async () => {
    const user = userEvent.setup();
    const onAddComment = vi.fn();
    render(<SessionCommentComposer {...baseProps} onAddComment={onAddComment} />);
    await user.type(screen.getByRole('textbox', { name: 'Add a comment' }), 'Nice one!{Enter}');
    expect(onAddComment).toHaveBeenCalledWith('Nice one!');
  });

  it('send button stays disabled while empty or isPosting, enabled once there is trimmed text', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<SessionCommentComposer {...baseProps} />);
    const postBtn = screen.getByRole('button', { name: 'Post comment' });
    expect(postBtn).toBeDisabled();

    await user.type(screen.getByRole('textbox', { name: 'Add a comment' }), '  ');
    expect(postBtn).toBeDisabled();

    await user.type(screen.getByRole('textbox', { name: 'Add a comment' }), 'x');
    expect(postBtn).not.toBeDisabled();

    rerender(<SessionCommentComposer {...baseProps} isPosting />);
    expect(screen.getByRole('button', { name: 'Post comment' })).toBeDisabled();
  });

  it('renders initials fallback for currentUser, blank when undefined', () => {
    const { rerender } = render(<SessionCommentComposer {...baseProps} />);
    expect(screen.getByText('JL')).toBeInTheDocument();

    rerender(<SessionCommentComposer {...baseProps} currentUser={undefined} />);
    expect(screen.queryByText('JL')).not.toBeInTheDocument();
  });
});
