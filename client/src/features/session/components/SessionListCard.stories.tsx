import type { Meta, StoryObj } from '@storybook/react-vite';
import type { SportKey, SportProfile } from '@/shared/types/sport';
import type { Location } from '@/shared/types/location';
import type { SessionListItem } from '../types';
import { SessionListCard } from './SessionListCard';

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
  address: '12 River Rd',
  latitude: 21.0285,
  longitude: 105.8542,
  sourceMapsUrl: null,
  claimedByVendorId: null,
  createdBy: 'user-1',
  createdAt: '2026-06-01T10:00:00',
  updatedAt: '2026-06-01T10:00:00',
};

function makeSession(overrides: Partial<SessionListItem> = {}): SessionListItem {
  return {
    id: 1,
    groupId: null,
    sessionType: 'STANDALONE',
    createdBy: 'user-1',
    createdByFullName: 'Jordan Lee',
    sportId: 6,
    sportName: 'Basketball',
    title: 'Sunday pickup run',
    description: null,
    location,
    locationNote: 'Court 3',
    scheduledStart: '2026-08-01T19:00:00',
    scheduledEndAt: '2026-08-01T20:30:00',
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
    createdAt: '2026-07-01T10:00:00',
    updatedAt: '2026-07-01T10:00:00',
    groupName: null,
    ...overrides,
  };
}

const meta = {
  title: 'Session/SessionListCard',
  component: SessionListCard,
  args: { sportsByKey, onViewDetails: () => {} },
  decorators: [(Story) => <div style={{ maxWidth: 400 }}>{Story()}</div>],
} satisfies Meta<typeof SessionListCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Standalone: Story = {
  args: { session: makeSession() },
};

export const Ongoing: Story = {
  args: { session: makeSession({ id: 3, status: 'ONGOING' }) },
};

export const Completed: Story = {
  args: { session: makeSession({ id: 4, status: 'COMPLETED' }) },
};

export const Cancelled: Story = {
  args: { session: makeSession({ id: 5, status: 'CANCELLED' }) },
};

export const NoTitle: Story = {
  args: { session: makeSession({ id: 6, title: null }) },
};

export const SingleParticipant: Story = {
  args: { session: makeSession({ id: 7, participantCount: 1 }) },
};

export const SplitCost: Story = {
  args: { session: makeSession({ id: 8, feeType: 'SPLIT' }) },
};

export const FixedFee: Story = {
  args: { session: makeSession({ id: 9, feeType: 'FIXED', feeAmountVnd: 50000 }) },
};

export const Uncapped: Story = {
  args: { session: makeSession({ id: 10, capacity: 9999 }) },
};
