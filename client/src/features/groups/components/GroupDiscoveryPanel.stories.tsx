import type { Meta, StoryObj } from '@storybook/react-vite';
import type { Group } from '@/features/feed/types';
import type { SportKey, SportProfile } from '@/shared/types/sport';
import { GroupDiscoveryPanel } from './GroupDiscoveryPanel';

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
    memberCount: 42,
    currentUserRole: 'group_member',
    createdAt: '2026-07-15T00:00:00',
    updatedAt: '2026-07-15T00:00:00',
    pinnedPosts: null,
    ...overrides,
  };
}

const meta = {
  title: 'Groups/GroupDiscoveryPanel',
  component: GroupDiscoveryPanel,
  args: {
    groups: [],
    sportsByKey,
    onOpenGroup: () => {},
    onCreateGroup: () => {},
    onJoinGroup: () => {},
    isLoading: false,
    isError: false,
    onRetry: () => {},
  },
} satisfies Meta<typeof GroupDiscoveryPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ZeroGroups: Story = {};

export const WithGroups: Story = {
  args: {
    groups: [
      group({ id: 1, sportId: 5, groupName: 'Riverside Ballers', memberCount: 42 }),
      group({ id: 2, sportId: 5, groupName: 'Downtown Strikers', memberCount: 12 }),
    ],
  },
};

// Self-contained placeholder photo (no network dependency).
const placeholderCoverUrl =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='160'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0' y1='0' x2='1' y2='1'%3E%3Cstop offset='0%25' stop-color='%23085041'/%3E%3Cstop offset='100%25' stop-color='%231f8f6f'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='400' height='160' fill='url(%23g)'/%3E%3C/svg%3E";

/** One group has a real cover photo, the other falls back to initials. */
export const WithCoverPhoto: Story = {
  args: {
    groups: [
      group({ id: 1, sportId: 5, groupName: 'Riverside Ballers', memberCount: 42, coverUrl: placeholderCoverUrl }),
      group({ id: 2, sportId: 5, groupName: 'Downtown Strikers', memberCount: 12 }),
    ],
  },
};

export const Loading: Story = { args: { isLoading: true } };
export const ErrorState: Story = { args: { isError: true } };
