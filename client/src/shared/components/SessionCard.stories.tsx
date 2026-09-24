import type { Meta, StoryObj } from '@storybook/react-vite';
import type { SportKey, SportProfile } from '@/shared/types/sport';
import type { Location } from '@/shared/types/location';
import type { ParticipantStatus, Session, SessionParticipant } from '@/shared/types/session';
import { SessionCard } from './SessionCard';

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
    likeCount: 0,
    isLikedByCurrentUser: false,
    callerParticipation: null,
    createdAt: '2026-07-01T10:00:00',
    updatedAt: '2026-07-01T10:00:00',
    ...overrides,
  };
}

function makeCallerParticipation(status: ParticipantStatus): SessionParticipant {
  return {
    id: 1,
    sessionId: 1,
    userId: 'user-1',
    userFullName: '',
    userAvatarUrl: null,
    status,
    rejectReason: null,
    createdAt: '2026-07-01T10:00:00',
  };
}

const meta = {
  title: 'Session/SessionCard',
  component: SessionCard,
  args: {
    sportsByKey,
    currentUserId: 'user-2', // not the session's creator (createdBy: 'user-1') by default
    onViewDetails: () => {},
    onParticipationAction: () => {},
    isParticipationActionPending: (): boolean => false,
  },
  decorators: [(Story) => <div style={{ maxWidth: 400 }}>{Story()}</div>],
} satisfies Meta<typeof SessionCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Full: Story = {
  args: { session: makeSession() },
};

/** CLIENT-SESSION-11: the right-rail row size (`UpcomingMatches`) — same content as `Full`, just
 * smaller badge/text/icons and no `IconUsers` before the participant count. */
export const Compact: Story = {
  args: { size: 'compact', session: makeSession({ id: 2 }) },
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

export const CallerJoined: Story = {
  args: { session: makeSession({ id: 11, callerParticipation: makeCallerParticipation('JOINED') }) },
};

/** Post-ship: the creator never gets the card's own Leave action either, same rule
 * `SessionDetailModal` applies — no participation action button renders at all here. */
export const CallerJoinedAsCreator: Story = {
  args: {
    currentUserId: 'user-1', // matches makeSession()'s default createdBy
    session: makeSession({ id: 15, callerParticipation: makeCallerParticipation('JOINED') }),
  },
};

export const CallerInvited: Story = {
  args: { session: makeSession({ id: 12, callerParticipation: makeCallerParticipation('INVITED') }) },
};

export const CallerRequested: Story = {
  args: { session: makeSession({ id: 13, callerParticipation: makeCallerParticipation('REQUESTED') }) },
};

export const ParticipationActionPending: Story = {
  args: { session: makeSession({ id: 14 }), isParticipationActionPending: () => true },
};

/** CLIENT-SESSION-23: a location name too long for one line is ellipsised (full name on hover via
 * `title`), never wrapped to a second line. */
export const LongLocationName: Story = {
  args: {
    session: makeSession({
      id: 16,
      location: {
        ...location,
        name: 'Riverside Indoor Multi-Sport Courts & Community Recreation Centre, Building B, Level 2',
      },
    }),
  },
};

/** CLIENT-SESSION-23: in a grid row taller than a card's own content (here, the tall spacer in the
 * third cell stretches the row), both cards stretch to the row height and their action buttons sit
 * on the same bottom edge instead of floating mid-card. */
export const ActionsStickToBottomInStretchedRow: Story = {
  args: { session: makeSession({ id: 17 }) },
  decorators: [
    (_Story, context) => (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12, maxWidth: 900 }}>
        <SessionCard {...context.args} session={makeSession({ id: 17 })} />
        <SessionCard
          {...context.args}
          session={makeSession({ id: 18, title: 'Short', location: { ...location, name: 'Court A' } })}
        />
        <div style={{ height: 280, border: '1px dashed currentColor' }} aria-hidden="true" />
      </div>
    ),
  ],
};

/** CLIENT-SESSION-30: a session with an end time shows "start – end" in 24h. */
export const WithEndTime: Story = {
  args: { session: makeSession({ id: 19, scheduledEndAt: '2026-08-01T21:00:00' }) },
};

/** CLIENT-SESSION-30: an overnight session adds the end date so it can't be misread. */
export const EndsNextDay: Story = {
  args: { session: makeSession({ id: 20, scheduledStart: '2026-08-01T22:00:00', scheduledEndAt: '2026-08-02T01:00:00' }) },
};

/** CLIENT-SESSION-30: the same overnight range in the narrow rail card — it ellipsises, full text on hover. */
export const EndsNextDayCompact: Story = {
  args: {
    size: 'compact',
    session: makeSession({ id: 21, scheduledStart: '2026-08-01T22:00:00', scheduledEndAt: '2026-08-02T01:00:00' }),
  },
  decorators: [(Story) => <div style={{ width: 240 }}>{Story()}</div>],
};
