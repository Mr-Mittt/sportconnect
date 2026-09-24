import type { Meta, StoryObj } from '@storybook/react-vite';
import type { SportKey, SportProfile } from '@/shared/types/sport';
import type { SessionListItem } from '../types';
import { RequestedSessionsSection } from './RequestedSessionsSection';

const sportsByKey: Record<SportKey, SportProfile> = {
  football: {
    key: 'football',
    label: 'Football',
    iconUrl: '/images/sports/football.png',
    colorRamp: 'teal',
  },
  basketball: {
    key: 'basketball',
    label: 'Basketball',
    iconUrl: '/images/sports/basketball.png',
    colorRamp: 'coral',
  },
  tennis: {
    key: 'tennis',
    label: 'Tennis',
    iconUrl: '/images/sports/tennis.png',
    colorRamp: 'purple',
  },
};

function makeSession(
  overrides: Partial<SessionListItem> & Pick<SessionListItem, 'id'>,
): SessionListItem {
  return {
    groupId: 1,
    sessionType: 'GROUP_RECURRING',
    createdBy: 'user-1',
    createdByFullName: 'Priya Shah',
    sportId: 6,
    sportName: 'Basketball',
    title: 'Ladder night',
    description: null,
    location: null,
    locationNote: null,
    scheduledStart: '2026-08-01T19:00:00',
    scheduledEndAt: null,
    status: 'SCHEDULED',
    cancelReason: null,
    cancelledBy: null,
    cancelledByFullName: null,
    cancelledAt: null,
    participantCount: 6,
    capacity: 10,
    feeType: 'FREE',
    feeAmountVnd: null,
    initialSlot: 0,
    autoApprove: false,
    likeCount: 0,
    isLikedByCurrentUser: false,
    callerParticipation: {
      id: 1,
      sessionId: 1,
      userId: 'user-2',
      userFullName: 'You',
      userAvatarUrl: null,
      status: 'REQUESTED',
      rejectReason: null,
      createdAt: '2026-07-01T10:00:00',
    },
    createdAt: '2026-07-01T10:00:00',
    updatedAt: '2026-07-01T10:00:00',
    groupName: 'Weekend Warriors',
    ...overrides,
  };
}

const meta = {
  title: 'Session/RequestedSessionsSection',
  component: RequestedSessionsSection,
  args: {
    sportsByKey,
    currentUserId: 'user-2',
    onViewDetails: () => {},
    onParticipationAction: () => {},
    isParticipationActionPending: () => false,
    gridClassName: 'grid grid-cols-1 gap-3 sm:grid-cols-2',
    isLoading: false,
    isError: false,
    hasMore: false,
    isFetchingMore: false,
    onLoadMore: () => {},
  },
} satisfies Meta<typeof RequestedSessionsSection>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {
  args: { sessions: [] },
};

export const Populated: Story = {
  args: {
    sessions: [
      makeSession({ id: 1, title: 'Ladder night' }),
      makeSession({
        id: 2,
        title: 'Weekend pickup',
        groupId: null,
        sessionType: 'STANDALONE',
        groupName: null,
      }),
    ],
  },
};

export const Loading: Story = {
  args: { sessions: [], isLoading: true },
};

export const ErrorState: Story = {
  args: { sessions: [], isError: true },
};
