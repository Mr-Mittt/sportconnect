import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { SportKey, SportProfile } from '@/shared/types/sport';
import type { SessionListItem } from '../types';
import { RequestedSessionsSection } from './RequestedSessionsSection';

const sportsByKey: Record<SportKey, SportProfile> = {
  football: { key: 'football', label: 'Football', iconUrl: '/f.png', colorRamp: 'teal' },
  basketball: { key: 'basketball', label: 'Basketball', iconUrl: '/b.png', colorRamp: 'coral' },
  tennis: { key: 'tennis', label: 'Tennis', iconUrl: '/t.png', colorRamp: 'purple' },
};

function makeSession(
  overrides: Partial<SessionListItem> & Pick<SessionListItem, 'id'>,
): SessionListItem {
  return {
    groupId: null,
    sessionType: 'STANDALONE',
    createdBy: 'user-1',
    createdByFullName: 'Jordan Lee',
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
    participantCount: 3,
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
    groupName: null,
    ...overrides,
  };
}

const renderSection = (
  overrides: Partial<React.ComponentProps<typeof RequestedSessionsSection>> = {},
) =>
  render(
    <RequestedSessionsSection
      sessions={[]}
      isLoading={false}
      isError={false}
      hasMore={false}
      isFetchingMore={false}
      onLoadMore={() => {}}
      sportsByKey={sportsByKey}
      currentUserId="user-2"
      onViewDetails={() => {}}
      onParticipationAction={() => {}}
      isParticipationActionPending={() => false}
      gridClassName="grid grid-cols-1 gap-3"
      {...overrides}
    />,
  );

describe('RequestedSessionsSection', () => {
  // 2026-09-23 revision — collapsible, same chevron + "{label} (count)" shell as
  // `DiscoverDateSection`, expanded by default.
  it('renders as a region with a collapsible header showing the loaded count', () => {
    renderSection({ sessions: [makeSession({ id: 1 })] });
    expect(screen.getByRole('region', { name: 'Requested sessions' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Collapse Requested sessions (1)' })).toBeInTheDocument();
  });

  it('collapses and re-expands, hiding/showing the results', async () => {
    const user = userEvent.setup();
    renderSection({ sessions: [makeSession({ id: 1, title: 'Ladder night' })] });

    const toggle = screen.getByRole('button', { name: 'Collapse Requested sessions (1)' });
    await user.click(toggle);
    expect(screen.queryByText('Ladder night')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Expand Requested sessions (1)' }));
    expect(screen.getByText('Ladder night')).toBeInTheDocument();
  });

  // 2026-09-23 (second revision) — no empty-state copy: the header's own "(0)" already says
  // there's nothing here, so the body renders nothing at all rather than a redundant message.
  it('shows the header with a (0) count and no empty-state copy when there are zero requested sessions', () => {
    renderSection({ sessions: [] });
    expect(screen.getByRole('button', { name: 'Collapse Requested sessions (0)' })).toBeInTheDocument();
    expect(screen.queryByText('No requested sessions.')).not.toBeInTheDocument();
  });

  it('renders a session card for each requested session', () => {
    renderSection({ sessions: [makeSession({ id: 1, title: 'Ladder night' })] });
    expect(screen.getByText('Ladder night')).toBeInTheDocument();
  });

  it('reports view-details clicks', async () => {
    const user = userEvent.setup();
    const onViewDetails = vi.fn();
    renderSection({ sessions: [makeSession({ id: 1 })], onViewDetails });

    await user.click(screen.getByRole('button', { name: /View details/i }));
    expect(onViewDetails).toHaveBeenCalledWith(1);
  });

  it('shows the error state', () => {
    renderSection({ isError: true });
    expect(screen.getByRole('alert')).toHaveTextContent("Couldn't load your requested sessions.");
  });
});
