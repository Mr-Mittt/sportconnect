import type { Meta, StoryObj } from '@storybook/react-vite';
import type { SportKey, SportProfile } from '@/shared/types/sport';
import type { Location } from '@/shared/types/location';
import type { SessionListItem } from '../types';
import { SessionDateGroup } from './SessionDateGroup';

const sportsByKey: Record<SportKey, SportProfile> = {
  football: { key: 'football', label: 'Football', icon: 'ball-football', colorRamp: 'teal' },
  basketball: { key: 'basketball', label: 'Basketball', icon: 'ball-basketball', colorRamp: 'coral' },
  tennis: { key: 'tennis', label: 'Tennis', icon: 'ball-tennis', colorRamp: 'purple' },
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

const meta = {
  title: 'Session/SessionDateGroup',
  component: SessionDateGroup,
  args: {
    sportsByKey,
    onToggleCollapsed: () => {},
    onViewDetails: () => {},
    onParticipationAction: () => {},
    isParticipationActionPending: () => false,
  },
  decorators: [(Story) => <div style={{ maxWidth: 420 }}>{Story()}</div>],
} satisfies Meta<typeof SessionDateGroup>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Today: Story = {
  args: {
    dateKey: '2026-08-05',
    dateLabel: 'Today',
    sessions: [makeSession({ id: 1 }), makeSession({ id: 2, title: 'Evening scrimmage', status: 'ONGOING' })],
    isCollapsed: false,
  },
};

export const PastDate: Story = {
  args: {
    dateKey: '2026-07-31',
    dateLabel: 'Jul 31, 2026',
    sessions: [makeSession({ id: 3, status: 'COMPLETED' })],
    isCollapsed: false,
  },
};

export const Collapsed: Story = {
  args: {
    dateKey: '2026-07-31',
    dateLabel: 'Jul 31, 2026',
    sessions: [makeSession({ id: 4, status: 'COMPLETED' })],
    isCollapsed: true,
  },
};
