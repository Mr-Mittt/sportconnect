import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { FriendRequestUnavailableDialog } from './FriendRequestUnavailableDialog';

describe('FriendRequestUnavailableDialog (CLIENT-NOTIF-5)', () => {
  it('renders nothing while closed', () => {
    render(<FriendRequestUnavailableDialog isOpen={false} onClose={() => {}} />);
    expect(screen.queryByText('Friend request unavailable')).not.toBeInTheDocument();
  });

  it('explains the request is gone when open', () => {
    render(<FriendRequestUnavailableDialog isOpen onClose={() => {}} />);
    expect(screen.getByText('Friend request unavailable')).toBeInTheDocument();
    expect(screen.getByText('This friend request is no longer available.')).toBeInTheDocument();
  });

  it('closes from "Got it"', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<FriendRequestUnavailableDialog isOpen onClose={onClose} />);

    await user.click(screen.getByRole('button', { name: 'Got it' }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
