import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { FriendRail } from './FriendRail';
import type { FriendRequestRow, FriendSectionKey, FriendUser, UserSearchResult } from '../types';

const priya: FriendUser = { id: 'f1', fullName: 'Priya Shah', avatarUrl: null, coverUrl: null, bio: null };
const marcus: FriendUser = { id: 'f2', fullName: 'Marcus Lee', avatarUrl: null, coverUrl: null, bio: null };

const incomingRequest: FriendRequestRow = { id: 'f3', name: 'Hana Kim', direction: 'incoming' };
const outgoingRequest: FriendRequestRow = { id: 'f4', name: 'Diego Alvarez', direction: 'outgoing' };

const collapsedSections: Record<FriendSectionKey, boolean> = {
  online: false,
  friendRequests: false,
  offline: false,
  blocked: false,
};

function baseProps() {
  return {
    query: '',
    onQueryChange: vi.fn(),
    onClear: vi.fn(),
    isAddMode: false,
    onToggleAddMode: vi.fn(),
    onBack: vi.fn(),
    collapsedSections,
    onToggleSection: vi.fn(),
    onlineFriends: [] as FriendUser[],
    friendRequestRows: [incomingRequest, outgoingRequest],
    totalFriendRequestsCount: 2,
    offlineFriends: [priya, marcus],
    totalFriendsCount: 2,
    blockedFriends: [] as FriendUser[],
    selectedPersonId: undefined as string | undefined,
    onSelectPerson: vi.fn(),
    searchResults: [] as UserSearchResult[],
    isSearching: false,
    isSearchError: false,
  };
}

describe('FriendRail', () => {
  it('renders all four sections with counts, in order', () => {
    render(<FriendRail {...baseProps()} />);
    const headers = screen.getAllByRole('button', { name: /\(\d+\)/ });
    expect(headers.map((h) => h.textContent)).toEqual([
      'Online (0)',
      'Friend Requests (2)',
      'Offline (2)',
      'Blocked (0)',
    ]);
  });

  it('Online and Blocked show "Nothing here yet." when empty', () => {
    render(<FriendRail {...baseProps()} />);
    expect(screen.getAllByText('Nothing here yet.')).toHaveLength(2);
  });

  it('shows an incoming-request badge only for incoming rows', () => {
    render(<FriendRail {...baseProps()} />);
    expect(screen.getByText('Hana Kim')).toBeInTheDocument();
    expect(screen.getByText('Diego Alvarez')).toBeInTheDocument();
  });

  it('selecting a row calls onSelectPerson with its id', async () => {
    const user = userEvent.setup();
    const props = baseProps();
    render(<FriendRail {...props} />);
    await user.click(screen.getByText('Priya Shah'));
    expect(props.onSelectPerson).toHaveBeenCalledWith('f1');
  });

  it('collapsing a section hides its rows', async () => {
    const user = userEvent.setup();
    const props = baseProps();
    render(<FriendRail {...props} />);
    await user.click(screen.getByRole('button', { name: 'Offline (2)' }));
    expect(props.onToggleSection).toHaveBeenCalledWith('offline');
  });

  it('the clear button only renders once the query is non-empty, and calls onClear', async () => {
    const user = userEvent.setup();
    const props = { ...baseProps(), query: 'pri' };
    render(<FriendRail {...props} />);
    const clearButton = screen.getByRole('button', { name: 'Clear search' });
    await user.click(clearButton);
    expect(props.onClear).toHaveBeenCalledTimes(1);
  });

  it('no clear button when the query is empty', () => {
    render(<FriendRail {...baseProps()} />);
    expect(screen.queryByRole('button', { name: 'Clear search' })).not.toBeInTheDocument();
  });

  it('Add mode renders Back + results instead of the 4 sections', () => {
    const searchResults: UserSearchResult[] = [
      {
        id: 'u1',
        fullName: 'Owen Clarke',
        username: 'owenc',
        avatarUrl: null,
        city: null,
        country: null,
        friendshipStatus: 'NONE',
      },
    ];
    render(
      <FriendRail {...baseProps()} isAddMode query="Owen" searchResults={searchResults} />,
    );
    expect(screen.getByRole('button', { name: /back to friend list/i })).toBeInTheDocument();
    expect(screen.getByText('Matches for "Owen"')).toBeInTheDocument();
    expect(screen.getByText('Owen Clarke')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Online (0)' })).not.toBeInTheDocument();
  });

  it('Add mode with zero results shows the "no users found" message', () => {
    render(<FriendRail {...baseProps()} isAddMode query="zzz" searchResults={[]} />);
    expect(screen.getByText('No users found for "zzz"')).toBeInTheDocument();
  });

  it('clicking Back calls onBack', async () => {
    const user = userEvent.setup();
    const props = { ...baseProps(), isAddMode: true, query: 'Owen' };
    render(<FriendRail {...props} />);
    await user.click(screen.getByRole('button', { name: /back to friend list/i }));
    expect(props.onBack).toHaveBeenCalledTimes(1);
  });

  it('clicking Add friend calls onToggleAddMode', async () => {
    const user = userEvent.setup();
    const props = baseProps();
    render(<FriendRail {...props} />);
    await user.click(screen.getByRole('button', { name: 'Add friend' }));
    expect(props.onToggleAddMode).toHaveBeenCalledTimes(1);
  });
});
