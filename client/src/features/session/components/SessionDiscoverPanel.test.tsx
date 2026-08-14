import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { SportKey, SportProfile } from '@/shared/types/sport';
import type { Location } from '@/shared/types/location';
import type { SessionListItem } from '../types';
import { SessionDiscoverPanel } from './SessionDiscoverPanel';

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

const renderPanel = (overrides: Partial<React.ComponentProps<typeof SessionDiscoverPanel>> = {}) =>
  render(
    <SessionDiscoverPanel
      searchMode="sessions"
      onSearchModeChange={() => {}}
      searchText=""
      onSearchTextChange={() => {}}
      sessions={[makeSession()]}
      isLoading={false}
      isError={false}
      sportsByKey={sportsByKey}
      currentUserId="user-2"
      onViewDetails={() => {}}
      onParticipationAction={() => {}}
      isParticipationActionPending={() => false}
      {...overrides}
    />,
  );

describe('SessionDiscoverPanel', () => {
  it('renders sessions and reports the selected id via onViewDetails', async () => {
    const user = userEvent.setup();
    const onViewDetails = vi.fn();
    renderPanel({ onViewDetails });

    await user.click(screen.getByRole('button', { name: /Weekend 5-a-side — View details/ }));
    expect(onViewDetails).toHaveBeenCalledWith(1);
  });

  it('shows loading state', () => {
    renderPanel({ isLoading: true, sessions: [] });
    expect(screen.getByText('Loading…')).toBeInTheDocument();
  });

  it('shows an error state', () => {
    renderPanel({ isError: true, sessions: [] });
    expect(screen.getByRole('alert')).toHaveTextContent("Couldn't load sessions to discover.");
  });

  it('shows the empty state copy for an empty search box', () => {
    renderPanel({ sessions: [], searchText: '' });
    expect(screen.getByText('No sessions to discover for this sport yet.')).toBeInTheDocument();
  });

  it('shows the empty state copy for a non-matching search', () => {
    renderPanel({ sessions: [], searchText: 'nonexistent' });
    expect(screen.getByText('No sessions match your search.')).toBeInTheDocument();
  });

  it('reports search text/mode changes', async () => {
    const user = userEvent.setup();
    const onSearchTextChange = vi.fn();
    const onSearchModeChange = vi.fn();
    renderPanel({ onSearchTextChange, onSearchModeChange });

    await user.type(screen.getByRole('textbox', { name: 'Search sessions' }), 'x');
    expect(onSearchTextChange).toHaveBeenCalledWith('x');

    await user.selectOptions(screen.getByRole('combobox', { name: 'Search scope' }), 'sessions');
    // 'sessions' is already selected — 'location'/'gear' are disabled options, so this just
    // confirms the select is wired without asserting a no-op value.
    expect(screen.getByRole('combobox', { name: 'Search scope' })).toHaveValue('sessions');
  });

  it('renders the Date/Time/Location filter pills as inert', () => {
    renderPanel();
    for (const label of ['Date', 'Time', 'Location']) {
      expect(screen.getByRole('button', { name: label })).toHaveAttribute('aria-disabled', 'true');
    }
  });
});
