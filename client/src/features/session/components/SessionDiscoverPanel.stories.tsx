import type { Meta, StoryObj } from '@storybook/react-vite';
import type { SportKey, SportProfile } from '@/shared/types/sport';
import type { Location } from '@/shared/types/location';
import type { SessionListItem } from '../types';
import { SessionDiscoverPanel } from './SessionDiscoverPanel';

const sportsByKey: Record<SportKey, SportProfile> = {
  football: { key: 'football', label: 'Football', icon: 'ball-football', colorRamp: 'teal' },
  basketball: { key: 'basketball', label: 'Basketball', icon: 'ball-basketball', colorRamp: 'coral' },
  tennis: { key: 'tennis', label: 'Tennis', icon: 'ball-tennis', colorRamp: 'purple' },
};

function makeLocation(name: string): Location {
  return {
    id: 1,
    sportId: 6,
    sportName: 'Basketball',
    name,
    address: null,
    latitude: null,
    longitude: null,
    sourceMapsUrl: null,
    claimedByVendorId: null,
    createdBy: 'user-1',
    createdAt: '2026-06-01T10:00:00',
    updatedAt: '2026-06-01T10:00:00',
  };
}

function makeSession(overrides: Partial<SessionListItem> & Pick<SessionListItem, 'id'>): SessionListItem {
  return {
    groupId: null,
    sessionType: 'STANDALONE',
    createdBy: 'user-1',
    createdByFullName: 'Jordan Lee',
    sportId: 6,
    sportName: 'Basketball',
    title: 'Weekend 5-a-side',
    description: null,
    location: makeLocation('Riverside Courts'),
    locationNote: null,
    scheduledStart: '2026-08-01T19:00:00',
    scheduledEndAt: null,
    status: 'SCHEDULED',
    cancelReason: null,
    cancelledBy: null,
    cancelledByFullName: null,
    cancelledAt: null,
    participantCount: 3,
    capacity: 10,
    feeType: 'FREE',
    feeAmountVnd: null,
    initialSlot: 0,
    autoApprove: false,
    likeCount: 0,
    isLikedByCurrentUser: false,
    createdAt: '2026-07-01T10:00:00',
    updatedAt: '2026-07-01T10:00:00',
    groupName: null,
    ...overrides,
  };
}

const sessions: SessionListItem[] = [
  makeSession({ id: 1, title: 'Weekend 5-a-side' }),
  makeSession({ id: 2, title: 'Sunday pickup run', sportId: 5, sportName: 'Football' }),
];

const meta = {
  title: 'Session/SessionDiscoverPanel',
  component: SessionDiscoverPanel,
  args: {
    sportsByKey,
    onSearchModeChange: () => {},
    onSearchTextChange: () => {},
    onViewDetails: () => {},
  },
  decorators: [(Story) => <div style={{ maxWidth: 640 }}>{Story()}</div>],
} satisfies Meta<typeof SessionDiscoverPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { searchMode: 'sessions', searchText: '', sessions, isLoading: false, isError: false },
};

export const Loading: Story = {
  args: { searchMode: 'sessions', searchText: '', sessions: [], isLoading: true, isError: false },
};

export const ErrorState: Story = {
  args: { searchMode: 'sessions', searchText: '', sessions: [], isLoading: false, isError: true },
};

export const EmptyNoQuery: Story = {
  args: { searchMode: 'sessions', searchText: '', sessions: [], isLoading: false, isError: false },
};

export const EmptySearchNoMatch: Story = {
  args: {
    searchMode: 'sessions',
    searchText: 'nonexistent',
    sessions: [],
    isLoading: false,
    isError: false,
  },
};
