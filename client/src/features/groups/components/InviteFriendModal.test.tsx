import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { InviteResultRow } from '@/features/groups/useInviteFriendModalData';
import type { UserSearchResult } from '@/features/friends/types';
import { InviteFriendModal } from './InviteFriendModal';

function user(overrides: Partial<UserSearchResult>): UserSearchResult {
  return {
    id: 'user-1',
    fullName: 'Robin Alvarez',
    username: 'robin.a',
    avatarUrl: null,
    city: null,
    country: null,
    friendshipStatus: 'FRIENDS',
    ...overrides,
  };
}

function row(overrides: Partial<InviteResultRow>): InviteResultRow {
  return {
    user: user({}),
    action: 'friend',
    isSending: false,
    error: null,
    ...overrides,
  };
}

describe('InviteFriendModal', () => {
  it('renders the current input value', () => {
    render(
      <InviteFriendModal
        isOpen
        onClose={vi.fn()}
        inputValue="robin"
        onInputChange={vi.fn()}
        rows={[]}
        isSearching={false}
        isSearchError={false}
        onInvite={vi.fn()}
      />,
    );
    expect(screen.getByLabelText('Search friends')).toHaveValue('robin');
  });

  it('calls onInputChange as the user types', async () => {
    const user_ = userEvent.setup();
    const onInputChange = vi.fn();
    render(
      <InviteFriendModal
        isOpen
        onClose={vi.fn()}
        inputValue=""
        onInputChange={onInputChange}
        rows={[]}
        isSearching={false}
        isSearchError={false}
        onInvite={vi.fn()}
      />,
    );
    await user_.type(screen.getByLabelText('Search friends'), 'r');
    expect(onInputChange).toHaveBeenCalledWith('r');
  });

  it('shows a hint below the 2-character minimum', () => {
    render(
      <InviteFriendModal
        isOpen
        onClose={vi.fn()}
        inputValue="r"
        onInputChange={vi.fn()}
        rows={[]}
        isSearching={false}
        isSearchError={false}
        onInvite={vi.fn()}
      />,
    );
    expect(screen.getByText('Type at least 2 characters to search.')).toBeInTheDocument();
  });

  it('shows "No friends found." when the query is long enough but there are no rows', () => {
    render(
      <InviteFriendModal
        isOpen
        onClose={vi.fn()}
        inputValue="zzz"
        onInputChange={vi.fn()}
        rows={[]}
        isSearching={false}
        isSearchError={false}
        onInvite={vi.fn()}
      />,
    );
    expect(screen.getByText('No friends found.')).toBeInTheDocument();
  });

  it('shows a loading state', () => {
    render(
      <InviteFriendModal
        isOpen
        onClose={vi.fn()}
        inputValue="ro"
        onInputChange={vi.fn()}
        rows={[]}
        isSearching
        isSearchError={false}
        onInvite={vi.fn()}
      />,
    );
    expect(screen.getByText('Searching…')).toBeInTheDocument();
  });

  it('shows a search error state', () => {
    render(
      <InviteFriendModal
        isOpen
        onClose={vi.fn()}
        inputValue="ro"
        onInputChange={vi.fn()}
        rows={[]}
        isSearching={false}
        isSearchError
        onInvite={vi.fn()}
      />,
    );
    expect(screen.getByText("Couldn't search. Try again.")).toBeInTheDocument();
  });

  it('renders an enabled Invite button for a friend row and calls onInvite with the user id', async () => {
    const user_ = userEvent.setup();
    const onInvite = vi.fn();
    render(
      <InviteFriendModal
        isOpen
        onClose={vi.fn()}
        inputValue="ro"
        onInputChange={vi.fn()}
        rows={[row({ user: user({ id: 'user-9' }) })]}
        isSearching={false}
        isSearchError={false}
        onInvite={onInvite}
      />,
    );
    await user_.click(screen.getByRole('button', { name: 'Invite' }));
    expect(onInvite).toHaveBeenCalledWith('user-9');
  });

  it('omits the @username line for a row with no username set', () => {
    render(
      <InviteFriendModal
        isOpen
        onClose={vi.fn()}
        inputValue="ro"
        onInputChange={vi.fn()}
        rows={[row({ user: user({ username: null }) })]}
        isSearching={false}
        isSearchError={false}
        onInvite={vi.fn()}
      />,
    );
    expect(screen.queryByText(/^@/)).not.toBeInTheDocument();
  });

  it('disables the Invite button while that row is sending', () => {
    render(
      <InviteFriendModal
        isOpen
        onClose={vi.fn()}
        inputValue="ro"
        onInputChange={vi.fn()}
        rows={[row({ isSending: true })]}
        isSearching={false}
        isSearchError={false}
        onInvite={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: 'Invite' })).toBeDisabled();
  });

  it('shows "Already a member" for a member row, with no Invite button', () => {
    render(
      <InviteFriendModal
        isOpen
        onClose={vi.fn()}
        inputValue="ro"
        onInputChange={vi.fn()}
        rows={[row({ action: 'member' })]}
        isSearching={false}
        isSearchError={false}
        onInvite={vi.fn()}
      />,
    );
    expect(screen.getByText('Already a member')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Invite' })).not.toBeInTheDocument();
  });

  it('shows "Already invited" for an invited row, with no Invite button', () => {
    render(
      <InviteFriendModal
        isOpen
        onClose={vi.fn()}
        inputValue="ro"
        onInputChange={vi.fn()}
        rows={[row({ action: 'invited' })]}
        isSearching={false}
        isSearchError={false}
        onInvite={vi.fn()}
      />,
    );
    expect(screen.getByText('Already invited')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Invite' })).not.toBeInTheDocument();
  });

  it('shows a per-row inline error without affecting other rows', () => {
    render(
      <InviteFriendModal
        isOpen
        onClose={vi.fn()}
        inputValue="ro"
        onInputChange={vi.fn()}
        rows={[
          row({ user: user({ id: 'user-1', fullName: 'Robin Alvarez' }), error: 'You can only invite your friends' }),
          row({ user: user({ id: 'user-2', fullName: 'Priya Shah' }) }),
        ]}
        isSearching={false}
        isSearchError={false}
        onInvite={vi.fn()}
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('You can only invite your friends');
  });

  it('calls onClose when the dialog is dismissed', async () => {
    const user_ = userEvent.setup();
    const onClose = vi.fn();
    render(
      <InviteFriendModal
        isOpen
        onClose={onClose}
        inputValue=""
        onInputChange={vi.fn()}
        rows={[]}
        isSearching={false}
        isSearchError={false}
        onInvite={vi.fn()}
      />,
    );
    await user_.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('renders nothing interactive when closed', () => {
    render(
      <InviteFriendModal
        isOpen={false}
        onClose={vi.fn()}
        inputValue=""
        onInputChange={vi.fn()}
        rows={[]}
        isSearching={false}
        isSearchError={false}
        onInvite={vi.fn()}
      />,
    );
    expect(screen.queryByLabelText('Search friends')).not.toBeInTheDocument();
  });
});
