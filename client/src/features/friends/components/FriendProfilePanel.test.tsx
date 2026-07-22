import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { FriendProfilePanel } from './FriendProfilePanel';
import type { SelectedPerson } from '../types';
import type { SportProfile } from '@/shared/types/sport';

const basePerson: SelectedPerson = {
  id: 'f1',
  fullName: 'Priya Shah',
  avatarUrl: null,
  coverUrl: null,
  bio: 'Weekend hooper.',
  friendshipStatus: 'FRIENDS',
  requestId: null,
};

const sports: SportProfile[] = [
  { key: 'basketball', label: 'Basketball', icon: 'ball-basketball', colorRamp: 'coral' },
];

function renderPanel(overrides: Partial<SelectedPerson> = {}) {
  const onSendRequest = vi.fn();
  const onAccept = vi.fn();
  const onDecline = vi.fn();
  render(
    <FriendProfilePanel
      person={{ ...basePerson, ...overrides }}
      sports={sports}
      isSportsLoading={false}
      onSendRequest={onSendRequest}
      onAccept={onAccept}
      onDecline={onDecline}
      isActionPending={false}
    />,
  );
  return { onSendRequest, onAccept, onDecline };
}

describe('FriendProfilePanel', () => {
  it('renders name, bio, and sport pills', () => {
    renderPanel();
    expect(screen.getByText('Priya Shah')).toBeInTheDocument();
    expect(screen.getByText('Weekend hooper.')).toBeInTheDocument();
    expect(screen.getByText('Basketball')).toBeInTheDocument();
  });

  it('Achievements starts collapsed and expands on click', async () => {
    const user = userEvent.setup();
    renderPanel();
    expect(screen.queryByText('Coming soon.')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Achievements' }));
    expect(screen.getByText('Coming soon.')).toBeInTheDocument();
  });

  it('renders no action bar for an existing friend', () => {
    renderPanel({ friendshipStatus: 'FRIENDS' });
    expect(screen.queryByRole('button', { name: /friend request|waiting|accept|decline/i })).not.toBeInTheDocument();
  });

  it('NONE: shows an enabled "Send a friend request" button', async () => {
    const user = userEvent.setup();
    const { onSendRequest } = renderPanel({ friendshipStatus: 'NONE' });
    const button = screen.getByRole('button', { name: 'Send a friend request' });
    expect(button).toBeEnabled();
    await user.click(button);
    expect(onSendRequest).toHaveBeenCalledTimes(1);
  });

  it('PENDING_SENT: shows a disabled "Waiting for response" button', () => {
    renderPanel({ friendshipStatus: 'PENDING_SENT' });
    expect(screen.getByRole('button', { name: 'Waiting for response' })).toBeDisabled();
  });

  it('PENDING_RECEIVED: Accept and Decline both call their handlers', async () => {
    const user = userEvent.setup();
    const { onAccept, onDecline } = renderPanel({
      friendshipStatus: 'PENDING_RECEIVED',
      requestId: 'req-1',
    });

    await user.click(screen.getByRole('button', { name: 'Accept' }));
    expect(onAccept).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('button', { name: 'Decline' }));
    expect(onDecline).toHaveBeenCalledTimes(1);
  });
});
