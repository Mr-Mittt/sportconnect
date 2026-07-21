import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { InviteFriendModal } from './InviteFriendModal';

describe('InviteFriendModal', () => {
  it('pre-fills the search input from initialQuery', () => {
    render(<InviteFriendModal isOpen onClose={vi.fn()} initialQuery="robin" />);
    expect(screen.getByLabelText('Search friends')).toHaveValue('robin');
  });

  it('always shows the mocked "Search coming soon" state, regardless of what is typed', async () => {
    const user = userEvent.setup();
    render(<InviteFriendModal isOpen onClose={vi.fn()} initialQuery="" />);

    expect(screen.getByText('Search coming soon.')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Search friends'), 'anyone');
    expect(screen.getByText('Search coming soon.')).toBeInTheDocument();
  });

  it('calls onClose when the dialog is dismissed', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<InviteFriendModal isOpen onClose={onClose} initialQuery="" />);

    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('renders nothing interactive when closed', () => {
    render(<InviteFriendModal isOpen={false} onClose={vi.fn()} initialQuery="" />);
    expect(screen.queryByLabelText('Search friends')).not.toBeInTheDocument();
  });
});
