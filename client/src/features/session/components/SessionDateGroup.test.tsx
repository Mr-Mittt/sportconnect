import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
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
    callerParticipation: null,
    createdAt: '2026-07-01T10:00:00',
    updatedAt: '2026-07-01T10:00:00',
    groupName: null,
    ...overrides,
  };
}

describe('SessionDateGroup', () => {
  it('renders the date label and every session card when expanded', () => {
    render(
      <SessionDateGroup
        dateKey="2026-08-05"
        dateLabel="Today"
        sessions={[makeSession({ id: 1 }), makeSession({ id: 2, title: 'Evening scrimmage' })]}
        sportsByKey={sportsByKey}
        isCollapsed={false}
        onToggleCollapsed={() => {}}
        onViewDetails={() => {}}
        onParticipationAction={() => {}}
        isParticipationActionPending={() => false}
      />,
    );
    expect(screen.getByText('Today')).toBeInTheDocument();
    expect(screen.getByText('Sunday pickup run')).toBeInTheDocument();
    expect(screen.getByText('Evening scrimmage')).toBeInTheDocument();
  });

  it('hides the session cards when collapsed', () => {
    render(
      <SessionDateGroup
        dateKey="2026-08-05"
        dateLabel="Today"
        sessions={[makeSession({ id: 1 })]}
        sportsByKey={sportsByKey}
        isCollapsed
        onToggleCollapsed={() => {}}
        onViewDetails={() => {}}
        onParticipationAction={() => {}}
        isParticipationActionPending={() => false}
      />,
    );
    expect(screen.getByText('Today')).toBeInTheDocument();
    expect(screen.queryByText('Sunday pickup run')).not.toBeInTheDocument();
  });

  it('calls onToggleCollapsed with the dateKey when the header is clicked', async () => {
    const user = userEvent.setup();
    const onToggleCollapsed = vi.fn();
    render(
      <SessionDateGroup
        dateKey="2026-07-31"
        dateLabel="Jul 31, 2026"
        sessions={[makeSession({ id: 1 })]}
        sportsByKey={sportsByKey}
        isCollapsed={false}
        onToggleCollapsed={onToggleCollapsed}
        onViewDetails={() => {}}
        onParticipationAction={() => {}}
        isParticipationActionPending={() => false}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Collapse Jul 31, 2026' }));
    expect(onToggleCollapsed).toHaveBeenCalledWith('2026-07-31');
  });

  it('forwards onViewDetails from the underlying SessionListCard', async () => {
    const user = userEvent.setup();
    const onViewDetails = vi.fn();
    render(
      <SessionDateGroup
        dateKey="2026-08-05"
        dateLabel="Today"
        sessions={[makeSession({ id: 42 })]}
        sportsByKey={sportsByKey}
        isCollapsed={false}
        onToggleCollapsed={() => {}}
        onViewDetails={onViewDetails}
        onParticipationAction={() => {}}
        isParticipationActionPending={() => false}
      />,
    );
    await user.click(screen.getByRole('button', { name: /Sunday pickup run — View details/ }));
    expect(onViewDetails).toHaveBeenCalledWith(42);
  });
});
