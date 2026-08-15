import type { Meta, StoryObj } from '@storybook/react-vite';
import type { Comment } from '@/features/feed/types';
import type { Location } from '@/shared/types/location';
import type { Session, SessionParticipant } from '@/shared/types/session';
import type { SportKey, SportProfile } from '@/shared/types/sport';
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
    likeCount: 2,
    isLikedByCurrentUser: false,
    callerParticipation: null,
    createdAt: '2026-07-01T10:00:00',
    updatedAt: '2026-07-01T10:00:00',
    ...overrides,
  };
}

function makeCallerParticipation(status: SessionParticipant['status']): SessionParticipant {
  return {
    id: 99,
    sessionId: 1,
    userId: 'user-3',
    userFullName: '',
    userAvatarUrl: null,
    status,
    rejectReason: null,
    createdAt: '2026-07-01T10:00:00',
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

// Storybook doesn't run Vitest's global `sportCatalogStore` seed (src/test/setup.ts) — the sport
// chip in the header just renders nothing if `sportKeyForId` can't resolve. Sport shown in the
// stories below matches the `sportId: 6` fixtures (Basketball), same convention as the rest of
// this file's pre-SPORT-3 fixture keys (see SPORT-3's own notes on why this stayed unmigrated).
const sportsByKey: Record<SportKey, SportProfile> = {
  basketball: { key: 'basketball', label: 'Basketball', iconUrl: '/images/sports/basketball.png', colorRamp: 'coral' },
};

const meta = {
  title: 'Session/SessionDetailModal',
  component: SessionDetailModal,
  args: {
    isOpen: true,
    onClose: () => {},
    session: makeSession(),
    sportsByKey,
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
    onToggleLike: () => {},
    isTogglingLike: false,
    currentUser: { fullName: 'Jordan Lee', avatarUrl: null },
    comments: [],
    isCommentsLoading: false,
    isCommentsError: false,
    isCommentsForbidden: false,
    hasMoreComments: false,
    isFetchingMoreComments: false,
    onFetchMoreComments: () => {},
    onAddComment: () => {},
    onAddCommentReply: () => {},
    isPostingComment: false,
    onDeleteComment: () => {},
    onToggleCommentLike: () => {},
  },
} satisfies Meta<typeof SessionDetailModal>;

export default meta;
type Story = StoryObj<typeof meta>;

export const NotJoinedYet: Story = {};

export const AlreadyJoined: Story = {
  args: { session: makeSession({ callerParticipation: makeCallerParticipation('JOINED') }) },
};

export const InvitedPendingAcceptDecline: Story = {
  args: { session: makeSession({ callerParticipation: makeCallerParticipation('INVITED') }) },
};

export const RequestedPendingApproval: Story = {
  args: { session: makeSession({ callerParticipation: makeCallerParticipation('REQUESTED') }) },
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

export const Liked: Story = {
  args: { session: makeSession({ likeCount: 3, isLikedByCurrentUser: true }) },
};

/** CLIENT-SESSION-4: only renders for a canManage caller with at least one REQUESTED row. */
export const ApprovalQueue: Story = {
  args: { canManage: true, requestedParticipants },
};

const discussionComment: Comment = {
  id: 1,
  postId: 1,
  userId: 'user-1',
  userFullName: 'Priya Shah',
  userAvatarUrl: null,
  content: 'What time are we meeting at the courts?',
  parentCommentId: null,
  likeCount: 1,
  replyCount: 0,
  isLikedByCurrentUser: false,
  replies: [],
  createdAt: '2026-07-03T10:00:00',
  updatedAt: '2026-07-03T10:00:00',
};

/** CLIENT-SESSION-8: the inline Discussion section, populated. */
export const WithDiscussion: Story = {
  args: { comments: [discussionComment] },
};

/** CLIENT-SESSION-8: a 403 on the comments fetch hides the whole Discussion section. */
export const DiscussionForbidden: Story = {
  args: { isCommentsForbidden: true },
};
