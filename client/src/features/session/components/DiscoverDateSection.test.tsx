import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
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

function makeSession(overrides: Partial<SessionListItem> = {}): SessionListItem {
  return {
    id: 1,
    groupId: null,
    sessionType: 'STANDALONE',
    createdBy: 'user-1',
    createdByFullName: 'Jordan Lee',
    sportId: 6,
    sportName: 'Basketball',
    title: 'Weekend 5-a-side',
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

function makeSection(overrides: Partial<DiscoverDateSectionData> = {}): DiscoverDateSectionData {
  return {
    date: '2026-08-01',
    label: 'Today',
    count: 1,
    isExpanded: true,
    sessions: [makeSession()],
    isLoading: false,
    isError: false,
    hasMore: false,
    isFetchingMore: false,
    ...overrides,
  };
}

const renderSection = (overrides: Partial<React.ComponentProps<typeof DiscoverDateSection>> = {}) =>
  render(
    <DiscoverDateSection
      section={makeSection()}
      onToggleExpanded={() => {}}
      onLoadMore={() => {}}
      sportsByKey={sportsByKey}
      currentUserId="user-2"
      onViewDetails={() => {}}
      onParticipationAction={() => {}}
      isParticipationActionPending={() => false}
      gridClassName="grid grid-cols-2 gap-3"
      {...overrides}
    />,
  );

describe('DiscoverDateSection', () => {
  it('shows the header label and count', () => {
    renderSection({ section: makeSection({ label: 'Tomorrow', count: 3 }) });
    expect(screen.getByText('Tomorrow (3)')).toBeInTheDocument();
  });

  it('renders nothing but the header when collapsed', () => {
    renderSection({ section: makeSection({ isExpanded: false }) });
    expect(screen.queryByText('Weekend 5-a-side')).not.toBeInTheDocument();
  });

  it('reports the toggled date when the header is clicked', async () => {
    const user = userEvent.setup();
    const onToggleExpanded = vi.fn();
    renderSection({ onToggleExpanded });

    await user.click(screen.getByRole('button', { name: /Today \(1\)/ }));
    expect(onToggleExpanded).toHaveBeenCalledWith('2026-08-01');
  });

  it('shows sessions when expanded', () => {
    renderSection();
    expect(screen.getByText('Weekend 5-a-side')).toBeInTheDocument();
  });

  it('shows the loading state', () => {
    renderSection({ section: makeSection({ isLoading: true, sessions: [] }) });
    expect(screen.getByText('Loading…')).toBeInTheDocument();
  });

  it('shows the error state', () => {
    renderSection({ section: makeSection({ isError: true, sessions: [] }) });
    expect(screen.getByRole('alert')).toHaveTextContent("Couldn't load sessions for Today.");
  });

  it('shows the empty state', () => {
    renderSection({ section: makeSection({ sessions: [] }) });
    expect(screen.getByText('No sessions to discover on Today.')).toBeInTheDocument();
  });

  it('shows a load-more button when hasMore, reporting the section date', async () => {
    const user = userEvent.setup();
    const onLoadMore = vi.fn();
    renderSection({ section: makeSection({ hasMore: true }), onLoadMore });

    await user.click(screen.getByRole('button', { name: 'Load more sessions' }));
    expect(onLoadMore).toHaveBeenCalledWith('2026-08-01');
  });

  it('disables the load-more button while fetching', () => {
    renderSection({ section: makeSection({ hasMore: true, isFetchingMore: true }) });
    expect(screen.getByRole('button', { name: 'Loading…' })).toBeDisabled();
  });
});
