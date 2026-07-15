import type { Meta, StoryObj } from '@storybook/react-vite';
import type { GroupSearchResult } from '@/features/feed/types';
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

const threeResults: GroupSearchResult[] = [
  result({ id: 1, groupName: 'Riverside Ballers', memberCount: 12 }),
  result({ id: 2, groupName: 'FC Weekend Warriors', memberCount: 8, isMember: true }),
  result({ id: 3, groupName: 'Downtown Strikers', memberCount: 20 }),
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
    results: [],
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

export const SearchResults: Story = {
  args: { inputValue: 'ballers', results: threeResults },
};

/** One row's request is already pending — shows the "Pending" badge instead of a button. */
export const WithPendingRequest: Story = {
  args: { inputValue: 'ballers', results: threeResults, pendingGroupIds: new Set([3]) },
};

export const Empty: Story = {
  args: { inputValue: 'nonexistent group' },
};

export const Loading: Story = {
  args: { inputValue: 'ballers', isSearching: true },
};

export const SearchErrorState: Story = {
  args: { inputValue: 'ballers', isSearchError: true },
};

export const RequestErrorState: Story = {
  args: { inputValue: 'ballers', results: threeResults, isRequestError: true },
};
