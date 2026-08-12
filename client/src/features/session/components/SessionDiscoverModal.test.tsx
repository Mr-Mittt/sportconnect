import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { SportKey, SportProfile } from '@/shared/types/sport';
import type { Location } from '@/shared/types/location';
import type { SessionListItem } from '../types';
import { SessionDiscoverModal } from './SessionDiscoverModal';

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
    createdAt: '2026-07-01T10:00:00',
    updatedAt: '2026-07-01T10:00:00',
    groupName: null,
    ...overrides,
  };
}

const baseProps = {
  isOpen: true,
  onClose: () => {},
  searchMode: 'sessions' as const,
  onSearchModeChange: () => {},
  searchText: '',
  onSearchTextChange: () => {},
  sessions: [makeSession()],
  isLoading: false,
  isError: false,
  sportsByKey,
  onViewDetails: () => {},
  availableSports: [] as SportKey[],
  onAddSport: () => {},
  isAddingSport: false,
  isAddSportError: false,
};

describe('SessionDiscoverModal', () => {
  it('renders nothing when closed', () => {
    render(<SessionDiscoverModal {...baseProps} isOpen={false} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders the Discover panel content when open, titled "Discover sessions"', () => {
    render(<SessionDiscoverModal {...baseProps} />);
    expect(screen.getByRole('dialog', { name: 'Discover sessions' })).toBeInTheDocument();
    expect(screen.getByText('Weekend 5-a-side')).toBeInTheDocument();
  });

  it('reports the selected session via onViewDetails', async () => {
    const user = userEvent.setup();
    const onViewDetails = vi.fn();
    render(<SessionDiscoverModal {...baseProps} onViewDetails={onViewDetails} />);

    await user.click(screen.getByRole('button', { name: /Weekend 5-a-side/ }));
    expect(onViewDetails).toHaveBeenCalledWith(1);
  });

  it('calls onClose when dismissed', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<SessionDiscoverModal {...baseProps} onClose={onClose} />);

    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
