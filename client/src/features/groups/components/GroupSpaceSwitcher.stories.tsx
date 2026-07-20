import type { Meta, StoryObj } from '@storybook/react-vite';
import type { SportKey, SportProfile } from '@/shared/types/sport';
import type { Group } from '@/features/feed/types';
import { GroupSpaceSwitcher } from './GroupSpaceSwitcher';

const sportsByKey: Record<SportKey, SportProfile> = {
  football: { key: 'football', label: 'Football', icon: 'ball-football', colorRamp: 'teal' },
  basketball: { key: 'basketball', label: 'Basketball', icon: 'ball-basketball', colorRamp: 'coral' },
  tennis: { key: 'tennis', label: 'Tennis', icon: 'ball-tennis', colorRamp: 'purple' },
};

function group(overrides: Partial<Group>): Group {
  return {
    id: 1,
    sportId: 5,
    groupName: 'Riverside Ballers',
    description: null,
    avatarUrl: null,
    coverUrl: null,
    isPrivate: false,
    isActive: true,
    createdBy: 'user-1',
    createdByFullName: 'Jordan Lee',
    memberCount: 12,
    currentUserRole: 'MEMBER',
    createdAt: '2026-07-01T00:00:00',
    updatedAt: '2026-07-01T00:00:00',
    pinnedPosts: null,
    ...overrides,
  };
}

const twoGroups: Group[] = [
  group({ id: 1, groupName: 'Riverside Ballers', sportId: 5 }),
  group({ id: 2, groupName: 'FC Weekend Warriors', sportId: 5 }),
];

const meta = {
  title: 'Groups/GroupSpaceSwitcher',
  component: GroupSpaceSwitcher,
  args: { isLoading: false, isError: false, onRetry: () => {} },
} satisfies Meta<typeof GroupSpaceSwitcher>;

export default meta;
type Story = StoryObj<typeof meta>;

export const AllActiveWithGroups: Story = {
  args: {
    groups: twoGroups,
    selectedGroupId: null,
    onSelect: () => {},
    sportsByKey,
  },
};

export const SpecificGroupActive: Story = {
  args: {
    groups: twoGroups,
    selectedGroupId: 2,
    onSelect: () => {},
    sportsByKey,
  },
};

/** No joined group for the active sport — just the bare "All" pill; Join/Create live in GroupDiscoveryPanel. */
export const NoGroupsForSport: Story = {
  args: {
    groups: [],
    selectedGroupId: null,
    onSelect: () => {},
    sportsByKey,
  },
};

export const Loading: Story = {
  args: {
    groups: [],
    selectedGroupId: null,
    onSelect: () => {},
    sportsByKey,
    isLoading: true,
  },
};

export const ErrorState: Story = {
  args: {
    groups: [],
    selectedGroupId: null,
    onSelect: () => {},
    sportsByKey,
    isError: true,
  },
};
