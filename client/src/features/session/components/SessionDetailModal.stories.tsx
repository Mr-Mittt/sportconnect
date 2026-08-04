import type { Meta, StoryObj } from '@storybook/react-vite';
import type { Location } from '@/shared/types/location';
import type { Session, SessionParticipant } from '@/shared/types/session';
import { SessionDetailModal } from './SessionDetailModal';

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

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    id: 1,
    groupId: null,
    sessionType: 'STANDALONE',
    createdBy: 'user-1',
    createdByFullName: 'Jordan Lee',
    sportId: 6,
    sportName: 'Basketball',
    title: 'Sunday pickup run',
    description: 'Casual 5v5, all levels welcome.',
    location,
    locationNote: 'Court 3',
    scheduledStart: '2026-08-01T19:00:00',
    scheduledEndAt: '2026-08-01T20:30:00',
    status: 'SCHEDULED',
    cancelReason: null,
    cancelledBy: null,
    cancelledByFullName: null,
    cancelledAt: null,
    participantCount: 2,
    capacity: 10,
    feeType: 'FREE',
    feeAmountVnd: null,
    initialSlot: 0,
    autoApprove: false,
    createdAt: '2026-07-01T10:00:00',
    updatedAt: '2026-07-01T10:00:00',
    ...overrides,
  };
}

const participants: SessionParticipant[] = [
  {
    id: 1,
    sessionId: 1,
    userId: 'user-1',
    userFullName: 'Jordan Lee',
    userAvatarUrl: null,
    status: 'JOINED',
    rejectReason: null,
    createdAt: '2026-07-01T10:00:00',
  },
  {
    id: 2,
    sessionId: 1,
    userId: 'user-2',
    userFullName: 'Priya Shah',
    userAvatarUrl: null,
    status: 'JOINED',
    rejectReason: null,
    createdAt: '2026-07-02T10:00:00',
  },
];

const requestedParticipants: SessionParticipant[] = [
  {
    id: 3,
    sessionId: 1,
    userId: 'user-4',
    userFullName: 'Alex Chen',
    userAvatarUrl: null,
    status: 'REQUESTED',
    rejectReason: null,
    createdAt: '2026-07-03T10:00:00',
  },
];

const meta = {
  title: 'Session/SessionDetailModal',
  component: SessionDetailModal,
  args: {
    isOpen: true,
    onClose: () => {},
    session: makeSession(),
    isLoading: false,
    isError: false,
    participants,
    isParticipantsLoading: false,
    isParticipantsError: false,
    currentUserId: 'user-3',
    canManage: false,
    onJoin: () => {},
    isJoining: false,
    isJoinError: false,
    onLeave: () => {},
    isLeaving: false,
    isLeaveError: false,
    onConfirmCancel: () => {},
    isCancelling: false,
    isCancelError: false,
    requestedParticipants: [],
    isRequestedParticipantsLoading: false,
    isRequestedParticipantsError: false,
    onApproveParticipant: () => {},
    isApprovingParticipant: false,
    onRejectParticipant: () => {},
    isRejectingParticipant: false,
  },
} satisfies Meta<typeof SessionDetailModal>;

export default meta;
type Story = StoryObj<typeof meta>;

export const NotJoinedYet: Story = {};

export const AlreadyJoined: Story = {
  args: { currentUserId: 'user-1' },
};

export const ManagerCanCancel: Story = {
  args: { canManage: true },
};

export const Loading: Story = {
  args: { session: undefined, isLoading: true, participants: [] },
};

export const LoadError: Story = {
  args: { session: undefined, isError: true, participants: [] },
};

export const GroupLinked: Story = {
  args: { session: makeSession({ groupId: 5, sessionType: 'GROUP_RECURRING' }) },
};

export const Ongoing: Story = {
  args: { session: makeSession({ status: 'ONGOING' }) },
};

export const Completed: Story = {
  args: { session: makeSession({ status: 'COMPLETED' }) },
};

export const Cancelled: Story = {
  args: {
    session: makeSession({
      status: 'CANCELLED',
      cancelledByFullName: 'Jordan Lee',
      cancelledAt: '2026-07-15T09:00:00',
      cancelReason: 'Court unavailable due to maintenance.',
    }),
  },
};

export const JoinError: Story = {
  args: { isJoinError: true },
};

export const NoTitleFallback: Story = {
  args: { session: makeSession({ title: null }) },
};

export const SplitCostFee: Story = {
  args: { session: makeSession({ feeType: 'SPLIT' }) },
};

export const FixedFee: Story = {
  args: { session: makeSession({ feeType: 'FIXED', feeAmountVnd: 50000 }) },
};

export const UncappedCapacity: Story = {
  args: { session: makeSession({ capacity: 9999 }) },
};

/** CLIENT-SESSION-4: only renders for a canManage caller with at least one REQUESTED row. */
export const ApprovalQueue: Story = {
  args: { canManage: true, requestedParticipants },
};
