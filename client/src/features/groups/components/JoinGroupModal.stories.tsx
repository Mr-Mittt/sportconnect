import type { Meta, StoryObj } from '@storybook/react-vite';
import type { GroupSearchResult } from '@/features/feed/types';
import type { GroupedSearchResults } from '@/features/groups/useJoinGroupModalData';
import type { SportKey, SportProfile } from '@/shared/types/sport';
import { JoinGroupModal } from './JoinGroupModal';

function result(overrides: Partial<GroupSearchResult>): GroupSearchResult {
  return {
    id: 1,
    sportId: 5,
    groupName: 'Riverside Ballers',
    description: null,
    avatarUrl: null,
    memberCount: 12,
    createdByFullName: 'Priya Shah',
    isMember: false,
    ...overrides,
  };
}

const football: SportProfile = { key: 'football', label: 'Football', icon: 'ball-football', colorRamp: 'teal' };
const tennis: SportProfile = { key: 'tennis', label: 'Tennis', icon: 'ball-tennis', colorRamp: 'purple' };
const sportProfiles = [football, tennis];

function grouped(sportProfile: SportProfile, results: GroupSearchResult[]): GroupedSearchResults {
  return { sportKey: sportProfile.key, sportProfile, results };
}

const groupedResults: GroupedSearchResults[] = [
  grouped(football, [
    result({ id: 1, groupName: 'Riverside Ballers', memberCount: 12 }),
    result({ id: 2, groupName: 'FC Weekend Warriors', memberCount: 8, isMember: true }),
  ]),
  grouped(tennis, [result({ id: 3, sportId: 2, groupName: 'Downtown Aces', memberCount: 20 })]),
];

const meta = {
  title: 'Groups/JoinGroupModal',
  component: JoinGroupModal,
  args: {
    isOpen: true,
    onClose: () => {},
    inputValue: '',
    onInputChange: () => {},
    onSearch: () => {},
    sportProfiles,
    selectedSports: new Set<SportKey>(['football', 'tennis']),
    onToggleSport: () => {},
    groupedResults: [],
    isSearching: false,
    isSearchError: false,
    pendingGroupIds: new Set<number>(),
    onRequestToJoin: () => {},
    isRequesting: false,
    isRequestError: false,
  },
} satisfies Meta<typeof JoinGroupModal>;

export default meta;
type Story = StoryObj<typeof meta>;

export const SearchResultsGroupedBySport: Story = {
  args: { inputValue: 'club', groupedResults },
};

/** Only one sport pill selected — mirrors opening the modal with a specific sport tab active. */
export const SingleSportSelected: Story = {
  args: {
    inputValue: 'club',
    selectedSports: new Set(['tennis']),
    groupedResults: [grouped(tennis, [result({ id: 3, sportId: 2, groupName: 'Downtown Aces' })])],
  },
};

/** One row's request is already pending — shows the "Pending" badge instead of a button. */
export const WithPendingRequest: Story = {
  args: { inputValue: 'club', groupedResults, pendingGroupIds: new Set([3]) },
};

export const Empty: Story = {
  args: { inputValue: 'nonexistent group' },
};

/** No sport pill selected — a genuine zero-result search, same empty state as no matches. */
export const NoSportSelected: Story = {
  args: { inputValue: 'club', selectedSports: new Set() },
};

export const Loading: Story = {
  args: { inputValue: 'club', isSearching: true },
};

export const SearchErrorState: Story = {
  args: { inputValue: 'club', isSearchError: true },
};

export const RequestErrorState: Story = {
  args: { inputValue: 'club', groupedResults, isRequestError: true },
};
