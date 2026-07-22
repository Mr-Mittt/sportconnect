import type { Meta, StoryObj } from '@storybook/react-vite';
import { FriendRail } from './FriendRail';
import type { FriendRequestRow, FriendSectionKey, FriendUser, UserSearchResult } from '../types';

const priya: FriendUser = { id: 'f1', fullName: 'Priya Shah', avatarUrl: null, coverUrl: null, bio: null };
const marcus: FriendUser = { id: 'f2', fullName: 'Marcus Lee', avatarUrl: null, coverUrl: null, bio: null };

const friendRequestRows: FriendRequestRow[] = [
  { id: 'f3', name: 'Hana Kim', direction: 'incoming' },
  { id: 'f4', name: 'Diego Alvarez', direction: 'outgoing' },
];

const expandedSections: Record<FriendSectionKey, boolean> = {
  online: false,
  friendRequests: false,
  offline: false,
  blocked: false,
};

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

const meta = {
  title: 'Friends/FriendRail',
  component: FriendRail,
  args: {
    query: '',
    onQueryChange: () => {},
    onClear: () => {},
    isAddMode: false,
    onToggleAddMode: () => {},
    onBack: () => {},
    collapsedSections: expandedSections,
    onToggleSection: () => {},
    onlineFriends: [],
    friendRequestRows,
    totalFriendRequestsCount: friendRequestRows.length,
    offlineFriends: [priya, marcus],
    totalFriendsCount: 2,
    blockedFriends: [],
    selectedPersonId: undefined,
    onSelectPerson: () => {},
    searchResults: [],
    isSearching: false,
    isSearchError: false,
  },
} satisfies Meta<typeof FriendRail>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Default mode, all 4 sections expanded — Online/Blocked always empty by design. */
export const Populated: Story = {};

/** No friends, no pending requests at all. */
export const Empty: Story = {
  args: { friendRequestRows: [], totalFriendRequestsCount: 0, offlineFriends: [], totalFriendsCount: 0 },
};

/** A row is selected (highlighted background). */
export const RowSelected: Story = {
  args: { selectedPersonId: 'f1' },
};

/** All 4 sections collapsed. */
export const AllCollapsed: Story = {
  args: {
    collapsedSections: { online: true, friendRequests: true, offline: true, blocked: true },
  },
};

/** Add mode with real search results. */
export const AddModeWithResults: Story = {
  args: { isAddMode: true, query: 'Owen', searchResults },
};

/** Add mode, zero matches for the typed query. */
export const AddModeNoResults: Story = {
  args: { isAddMode: true, query: 'zzz', searchResults: [] },
};

/** Add mode while the debounced query is in flight. */
export const AddModeSearching: Story = {
  args: { isAddMode: true, query: 'Owen', isSearching: true, searchResults: [] },
};
