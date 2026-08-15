import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { SportKey, SportProfile } from '@/shared/types/sport';
import type { Location } from '@/shared/types/location';
import type { Session } from '@/shared/types/session';
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
  address: null,
  latitude: null,
  longitude: null,
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
    locationNote: null,
    scheduledStart: '2026-08-01T19:00:00',
    scheduledEndAt: null,
    status: 'SCHEDULED',
    cancelReason: null,
    cancelledBy: null,
    cancelledByFullName: null,
    cancelledAt: null,
    participantCount: 3,
    // 9999 = the backend's "uncapped" sentinel — keeps the plain "N participants" text the
    // default here; individual tests below override it to exercise the "N/capacity" display.
    capacity: 9999,
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

const noopParticipationAction = () => {};
const noPendingAction = () => false;

describe('SessionCard', () => {
  it('renders the title, status, location, and participant count (defaults to size="full")', () => {
    render(
      <SessionCard
        session={makeSession()}
        sportsByKey={sportsByKey}
        currentUserId="user-2"
        onViewDetails={() => {}}
        onParticipationAction={noopParticipationAction}
        isParticipationActionPending={noPendingAction}
      />,
    );
    expect(screen.getByText('Sunday pickup run')).toBeInTheDocument();
    expect(screen.getByText('Scheduled')).toBeInTheDocument();
    expect(screen.getByText('Riverside Courts')).toBeInTheDocument();
    expect(screen.getByText('3 participants')).toBeInTheDocument();
  });

  it('renders the same content at size="compact"', () => {
    render(
      <SessionCard
        size="compact"
        session={makeSession()}
        sportsByKey={sportsByKey}
        currentUserId="user-2"
        onViewDetails={() => {}}
        onParticipationAction={noopParticipationAction}
        isParticipationActionPending={noPendingAction}
      />,
    );
    expect(screen.getByText('Sunday pickup run')).toBeInTheDocument();
    expect(screen.getByText('Scheduled')).toBeInTheDocument();
    expect(screen.getByText('Riverside Courts')).toBeInTheDocument();
    expect(screen.getByText('3 participants')).toBeInTheDocument();
  });

  it('falls back to "{sportName} session" when title is null', () => {
    render(
      <SessionCard
        session={makeSession({ title: null })}
        sportsByKey={sportsByKey}
        currentUserId="user-2"
        onViewDetails={() => {}}
        onParticipationAction={noopParticipationAction}
        isParticipationActionPending={noPendingAction}
      />,
    );
    expect(screen.getByText('Basketball session')).toBeInTheDocument();
  });

  it('singularizes "1 participant"', () => {
    render(
      <SessionCard
        session={makeSession({ participantCount: 1 })}
        sportsByKey={sportsByKey}
        currentUserId="user-2"
        onViewDetails={() => {}}
        onParticipationAction={noopParticipationAction}
        isParticipationActionPending={noPendingAction}
      />,
    );
    expect(screen.getByText('1 participant')).toBeInTheDocument();
  });

  it('shows "N/capacity participants" once a real capacity was chosen', () => {
    render(
      <SessionCard
        session={makeSession({ participantCount: 3, capacity: 10 })}
        sportsByKey={sportsByKey}
        currentUserId="user-2"
        onViewDetails={() => {}}
        onParticipationAction={noopParticipationAction}
        isParticipationActionPending={noPendingAction}
      />,
    );
    expect(screen.getByText('3/10 participants')).toBeInTheDocument();
  });

  it('shows the fee — Free, Split cost, or a formatted VND amount', () => {
    const { rerender } = render(
      <SessionCard
        session={makeSession()}
        sportsByKey={sportsByKey}
        currentUserId="user-2"
        onViewDetails={() => {}}
        onParticipationAction={noopParticipationAction}
        isParticipationActionPending={noPendingAction}
      />,
    );
    expect(screen.getByText('Free')).toBeInTheDocument();

    rerender(
      <SessionCard
        session={makeSession({ feeType: 'SPLIT' })}
        sportsByKey={sportsByKey}
        currentUserId="user-2"
        onViewDetails={() => {}}
        onParticipationAction={noopParticipationAction}
        isParticipationActionPending={noPendingAction}
      />,
    );
    expect(screen.getByText('Split cost')).toBeInTheDocument();

    rerender(
      <SessionCard
        session={makeSession({ feeType: 'FIXED', feeAmountVnd: 50000 })}
        sportsByKey={sportsByKey}
        currentUserId="user-2"
        onViewDetails={() => {}}
        onParticipationAction={noopParticipationAction}
        isParticipationActionPending={noPendingAction}
      />,
    );
    expect(screen.getByText('50 000 ₫')).toBeInTheDocument();
  });

  it('calls onViewDetails with the session id when "View details" is clicked', async () => {
    const user = userEvent.setup();
    const onViewDetails = vi.fn();
    render(
      <SessionCard
        session={makeSession({ id: 42 })}
        sportsByKey={sportsByKey}
        currentUserId="user-2"
        onViewDetails={onViewDetails}
        onParticipationAction={noopParticipationAction}
        isParticipationActionPending={noPendingAction}
      />,
    );
    await user.click(screen.getByRole('button', { name: /view details/i }));
    expect(onViewDetails).toHaveBeenCalledWith(42);
  });

  it('shows a Join action for a session the caller has no row on, and calls onParticipationAction', async () => {
    const user = userEvent.setup();
    const onParticipationAction = vi.fn();
    render(
      <SessionCard
        session={makeSession({ id: 42 })}
        sportsByKey={sportsByKey}
        currentUserId="user-2"
        onViewDetails={() => {}}
        onParticipationAction={onParticipationAction}
        isParticipationActionPending={noPendingAction}
      />,
    );
    await user.click(screen.getByRole('button', { name: /join/i }));
    expect(onParticipationAction).toHaveBeenCalledWith(42, 'JOIN');
  });

  it('shows a Leave action when the caller is JOINED', () => {
    render(
      <SessionCard
        session={makeSession({
          callerParticipation: {
            id: 1,
            sessionId: 1,
            userId: 'user-1',
            userFullName: '',
            userAvatarUrl: null,
            status: 'JOINED',
            rejectReason: null,
            createdAt: '2026-07-01T10:00:00',
          },
        })}
        sportsByKey={sportsByKey}
        currentUserId="user-2"
        onViewDetails={() => {}}
        onParticipationAction={noopParticipationAction}
        isParticipationActionPending={noPendingAction}
      />,
    );
    expect(screen.getByRole('button', { name: /leave/i })).toBeInTheDocument();
  });

  it('hides Leave for the session creator, even when JOINED', () => {
    render(
      <SessionCard
        session={makeSession({
          callerParticipation: {
            id: 1,
            sessionId: 1,
            userId: 'user-1',
            userFullName: '',
            userAvatarUrl: null,
            status: 'JOINED',
            rejectReason: null,
            createdAt: '2026-07-01T10:00:00',
          },
        })}
        sportsByKey={sportsByKey}
        currentUserId="user-1" // matches makeSession()'s default createdBy
        onViewDetails={() => {}}
        onParticipationAction={noopParticipationAction}
        isParticipationActionPending={noPendingAction}
      />,
    );
    expect(screen.queryByRole('button', { name: /leave/i })).not.toBeInTheDocument();
  });

  it('clicking the card itself opens details too, without double-firing when a nested button is clicked', async () => {
    const user = userEvent.setup();
    const onViewDetails = vi.fn();
    const onParticipationAction = vi.fn();
    render(
      <SessionCard
        session={makeSession({ id: 42 })}
        sportsByKey={sportsByKey}
        currentUserId="user-2"
        onViewDetails={onViewDetails}
        onParticipationAction={onParticipationAction}
        isParticipationActionPending={noPendingAction}
      />,
    );

    await user.click(screen.getByText('Sunday pickup run'));
    expect(onViewDetails).toHaveBeenCalledWith(42);
    expect(onViewDetails).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: /join/i }));
    expect(onParticipationAction).toHaveBeenCalledWith(42, 'JOIN');
    // The card's own click handler must not also fire from a click on the nested button.
    expect(onViewDetails).toHaveBeenCalledTimes(1);
  });

  it('hides the participation action for a CANCELLED session', () => {
    render(
      <SessionCard
        session={makeSession({ status: 'CANCELLED' })}
        sportsByKey={sportsByKey}
        currentUserId="user-2"
        onViewDetails={() => {}}
        onParticipationAction={noopParticipationAction}
        isParticipationActionPending={noPendingAction}
      />,
    );
    expect(screen.getByRole('button', { name: /view details/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /join|leave/i })).not.toBeInTheDocument();
  });

  it('disables the participation action while pending', () => {
    render(
      <SessionCard
        session={makeSession({ id: 42 })}
        sportsByKey={sportsByKey}
        currentUserId="user-2"
        onViewDetails={() => {}}
        onParticipationAction={noopParticipationAction}
        isParticipationActionPending={(sessionId) => sessionId === 42}
      />,
    );
    expect(screen.getByRole('button', { name: /join/i })).toBeDisabled();
  });
});
