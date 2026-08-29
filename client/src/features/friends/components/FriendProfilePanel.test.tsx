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
  { key: 'basketball', label: 'Basketball', iconUrl: '/images/sports/basketball.png', colorRamp: 'coral' },
];

function renderPanel(
  overrides: Partial<SelectedPerson> = {},
  propOverrides: { isUnfriendError?: boolean; isActionPending?: boolean } = {},
) {
  const onSendRequest = vi.fn();
  const onAccept = vi.fn();
  const onDecline = vi.fn();
  const onCancel = vi.fn();
  const onUnfriend = vi.fn();
  const onUnfriendDialogClose = vi.fn();
  render(
    <FriendProfilePanel
      person={{ ...basePerson, ...overrides }}
      sports={sports}
      isSportsLoading={false}
      onSendRequest={onSendRequest}
      onAccept={onAccept}
      onDecline={onDecline}
      onCancel={onCancel}
      onUnfriend={onUnfriend}
      onUnfriendDialogClose={onUnfriendDialogClose}
      isUnfriendError={propOverrides.isUnfriendError ?? false}
      isActionPending={propOverrides.isActionPending ?? false}
    />,
  );
  return { onSendRequest, onAccept, onDecline, onCancel, onUnfriend, onUnfriendDialogClose };
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

  it('FRIENDS: shows only the "Friend" menu button, no request/accept/decline actions', () => {
    renderPanel({ friendshipStatus: 'FRIENDS' });
    expect(screen.getByRole('button', { name: 'Friend' })).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /friend request|waiting|accept|decline/i }),
    ).not.toBeInTheDocument();
  });

  it('FRIENDS: the Friend menu opens a confirm dialog whose Unfriend button calls onUnfriend', async () => {
    const user = userEvent.setup();
    const { onUnfriend } = renderPanel({ friendshipStatus: 'FRIENDS' });

    await user.click(screen.getByRole('button', { name: 'Friend' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Unfriend' }));

    expect(screen.getByText('Do you really want to unfriend Priya Shah?')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Unfriend' }));
    expect(onUnfriend).toHaveBeenCalledTimes(1);
  });

  it('FRIENDS: closing the confirm dialog calls onUnfriendDialogClose (mutation reset hook)', async () => {
    const user = userEvent.setup();
    const { onUnfriendDialogClose } = renderPanel({ friendshipStatus: 'FRIENDS' });

    await user.click(screen.getByRole('button', { name: 'Friend' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Unfriend' }));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onUnfriendDialogClose).toHaveBeenCalledTimes(1);
  });

  it('FRIENDS: surfaces an unfriend error inside the dialog', async () => {
    const user = userEvent.setup();
    renderPanel({ friendshipStatus: 'FRIENDS' }, { isUnfriendError: true });

    await user.click(screen.getByRole('button', { name: 'Friend' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Unfriend' }));

    expect(screen.getByRole('alert')).toHaveTextContent(
      "Couldn't unfriend Priya Shah. Please try again.",
    );
  });

  it('NONE: shows an enabled "Send a friend request" button', async () => {
    const user = userEvent.setup();
    const { onSendRequest } = renderPanel({ friendshipStatus: 'NONE' });
    const button = screen.getByRole('button', { name: 'Send a friend request' });
    expect(button).toBeEnabled();
    await user.click(button);
    expect(onSendRequest).toHaveBeenCalledTimes(1);
  });

  it('PENDING_SENT: shows the "Waiting for response" status and a "Cancel request" button that calls onCancel', async () => {
    const user = userEvent.setup();
    const { onCancel } = renderPanel({ friendshipStatus: 'PENDING_SENT', requestId: 'req-2' });

    expect(screen.getByText('Waiting for response')).toBeInTheDocument();
    const cancel = screen.getByRole('button', { name: 'Cancel request' });
    expect(cancel).toBeEnabled();
    await user.click(cancel);
    expect(onCancel).toHaveBeenCalledTimes(1);
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
