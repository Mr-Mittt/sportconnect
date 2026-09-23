import type { Meta, StoryObj } from '@storybook/react-vite';
import type { SportKey, SportProfile } from '@/shared/types/sport';
import type { Location } from '@/shared/types/location';
import type { DiscoverDateSection as DiscoverDateSectionData, SessionListItem } from '../types';
import { DiscoverDateSection } from './DiscoverDateSection';

const sportsByKey: Record<SportKey, SportProfile> = {
  football: { key: 'football', label: 'Football', iconUrl: '/images/sports/football.png', colorRamp: 'teal' },
  basketball: { key: 'basketball', label: 'Basketball', iconUrl: '/images/sports/basketball.png', colorRamp: 'coral' },
  tennis: { key: 'tennis', label: 'Tennis', iconUrl: '/images/sports/tennis.png', colorRamp: 'purple' },
};

const location: Location = {
  id: 1,
  sportId: 6,
  sportName: 'Basketball',
  name: 'Riverside Courts',
  address: null,
  latitude: null,
  longitude: null,
  sourceMapsUrl: null,
  claimedByVendorId: null,
  createdBy: 'user-1',
  createdAt: '2026-06-01T10:00:00',
  updatedAt: '2026-06-01T10:00:00',
};

function makeSession(overrides: Partial<SessionListItem> & Pick<SessionListItem, 'id'>): SessionListItem {
  return {
    groupId: null,
    sessionType: 'STANDALONE',
    createdBy: 'user-1',
    createdByFullName: 'Jordan Lee',
    sportId: 6,
    sportName: 'Basketball',
    title: 'Sunday pickup run',
    description: null,
    location,
    locationNote: null,
    scheduledStart: '2026-08-05T19:00:00',
    scheduledEndAt: '2026-08-05T20:30:00',
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
    callerParticipation: null,
    createdAt: '2026-07-01T10:00:00',
    updatedAt: '2026-07-01T10:00:00',
    groupName: null,
    ...overrides,
  };
}

function makeSection(overrides: Partial<DiscoverDateSectionData> & Pick<DiscoverDateSectionData, 'date' | 'label'>): DiscoverDateSectionData {
  return {
    count: 0,
    isExpanded: true,
    sessions: [],
    isLoading: false,
    isError: false,
    hasMore: false,
    isFetchingMore: false,
    ...overrides,
  };
}

const meta = {
  title: 'Session/DiscoverDateSection',
  component: DiscoverDateSection,
  args: {
    sportsByKey,
    currentUserId: 'user-2', // not the sessions' creator (createdBy: 'user-1') by default
    onToggleExpanded: () => {},
    onLoadMore: () => {},
    onViewDetails: () => {},
    onParticipationAction: () => {},
    isParticipationActionPending: () => false,
    gridClassName: 'grid grid-cols-1 gap-3 sm:grid-cols-2',
  },
  decorators: [(Story) => <div style={{ maxWidth: 640 }}>{Story()}</div>],
} satisfies Meta<typeof DiscoverDateSection>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Expanded: Story = {
  args: {
    section: makeSection({
      date: '2026-08-05',
      label: 'Today',
      count: 2,
      sessions: [makeSession({ id: 1 }), makeSession({ id: 2, title: 'Evening scrimmage' })],
    }),
  },
};

export const Collapsed: Story = {
  args: {
    section: makeSection({ date: '2026-08-06', label: 'Tomorrow', count: 3, isExpanded: false }),
  },
};

export const Loading: Story = {
  args: {
    section: makeSection({ date: '2026-08-05', label: 'Today', isLoading: true }),
  },
};

export const ErrorState: Story = {
  args: {
    section: makeSection({ date: '2026-08-05', label: 'Today', isError: true }),
  },
};

export const Empty: Story = {
  args: {
    section: makeSection({ date: '2026-08-05', label: 'Today' }),
  },
};

export const WithLoadMore: Story = {
  args: {
    section: makeSection({
      date: '2026-08-05',
      label: 'Today',
      count: 12,
      sessions: [makeSession({ id: 1 }), makeSession({ id: 2, title: 'Evening scrimmage' })],
      hasMore: true,
    }),
  },
};
