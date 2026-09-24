import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { LocationPickerProps } from '@/features/location/components/LocationPicker';
import type { SportKey, SportProfile } from '@/shared/types/sport';
import type { Location } from '@/shared/types/location';
import type { SessionListItem } from '../types';
import { SessionDiscoverModal } from './SessionDiscoverModal';

const locationPicker: LocationPickerProps = {
  isOpen: false,
  onClose: () => {},
  mode: 'search',
  onSwitchToCreate: () => {},
  onSwitchToSearch: () => {},
  inputValue: '',
  onInputChange: () => {},
  onSearch: () => {},
  results: [],
  isSearching: false,
  isSearchError: false,
  onSelectResult: () => {},
  favoriteLocationIds: new Set<number>(),
  onToggleFavorite: () => {},
  isTogglingFavorite: false,
  onOpenGoogleMaps: () => {},
  mapsUrlInput: '',
  onMapsUrlChange: () => {},
  onResolveUrl: () => {},
  isResolving: false,
  isResolveError: false,
  resolvedNoCoordinates: false,
  coordinates: null,
  mapSeed: 0,
  onMovePin: () => {},
  name: '',
  onNameChange: () => {},
  address: '',
  onAddressChange: () => {},
  canSave: false,
  onSave: () => {},
  isSaving: false,
  isSaveError: false,
};

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

const baseProps = {
  isOpen: true,
  onClose: () => {},
  sportId: 5, // football — matches sportsByKey below, resolved via the global catalog seed
  onSportIdChange: () => {},
  searchText: '',
  onSearchTextChange: () => {},
  isLocationFilterAvailable: true,
  selectedLocations: [],
  onToggleLocation: () => {},
  onClearLocationFilter: () => {},
  favoriteLocations: [],
  isFavoriteLocationsLoading: false,
  locationSearchText: '',
  onLocationSearchTextChange: () => {},
  locationSearchResults: [],
  isLocationSearchLoading: false,
  onOpenLocationPicker: () => {},
  locationPicker,
  selectedStatuses: [],
  onToggleStatus: () => {},
  minOpenSlotsText: '',
  onMinOpenSlotsTextChange: () => {},
  onClearOpenSlotsFilter: () => {},
  feeType: undefined,
  onToggleFeeType: () => {},
  maxFeeAmountVndText: '',
  onMaxFeeAmountVndChange: () => {},
  onClearFeeFilter: () => {},
  startTimeFilter: undefined,
  onStartTimeFilterChange: () => {},
  startTime: undefined,
  onStartTimeChange: () => {},
  onClearTimeFilter: () => {},
  sessions: [makeSession()],
  isLoading: false,
  isError: false,
  hasMore: false,
  isFetchingMore: false,
  onLoadMore: () => {},
  sportsByKey,
  currentUserId: 'user-2',
  onViewDetails: () => {},
  onParticipationAction: () => {},
  isParticipationActionPending: () => false,
  availableSports: [] as SportKey[],
  onAddSport: () => {},
  isAddingSport: false,
  isAddSportError: false,
};

/** "Discover more" uses react-router's useNavigate — same two-route memory-router shape
 * `CreatePostForm.test.tsx` established. Returns the router so a test can assert the resulting
 * path. */
function renderModal(overrides: Partial<React.ComponentProps<typeof SessionDiscoverModal>> = {}) {
  const router = createMemoryRouter(
    [
      { path: '/a', element: <SessionDiscoverModal {...baseProps} {...overrides} /> },
      { path: '/matches', element: <div>Matches page</div> },
    ],
    { initialEntries: ['/a'] },
  );
  const result = render(<RouterProvider router={router} />);
  return { ...result, router };
}

describe('SessionDiscoverModal', () => {
  it('renders nothing when closed', () => {
    renderModal({ isOpen: false });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders the Discover panel content when open, titled "Discover today session"', () => {
    renderModal();
    expect(screen.getByRole('dialog', { name: 'Discover today session' })).toBeInTheDocument();
    expect(screen.getByText('Weekend 5-a-side')).toBeInTheDocument();
  });

  it('has no Date filter pill (today-only, CLIENT-SESSION-22 delta)', () => {
    renderModal();
    expect(screen.queryByRole('button', { name: /^Date/ })).not.toBeInTheDocument();
  });

  it('reports the selected session via onViewDetails', async () => {
    const user = userEvent.setup();
    const onViewDetails = vi.fn();
    renderModal({ onViewDetails });

    await user.click(screen.getByRole('button', { name: /Weekend 5-a-side — View details/ }));
    expect(onViewDetails).toHaveBeenCalledWith(1);
  });

  it('calls onClose when dismissed', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    renderModal({ onClose });

    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('shows a load-more button when hasMore, reporting via onLoadMore', async () => {
    const user = userEvent.setup();
    const onLoadMore = vi.fn();
    renderModal({ hasMore: true, onLoadMore });

    await user.click(screen.getByRole('button', { name: 'Load more' }));
    expect(onLoadMore).toHaveBeenCalledTimes(1);
  });

  it('"Discover more" closes the modal and navigates to /matches', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const { router } = renderModal({ onClose });

    expect(screen.getByText('Find session for another date?')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Discover more' }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(router.state.location.pathname).toBe('/matches');
  });

  // CLIENT-SESSION-29 revision (2026-09-23) — the sport dropdown replacing the old search-scope
  // <select>, pre-filled from `sportId` and offering every key in `sportsByKey`.
  it('shows the sport dropdown pre-filled from sportId, offering every held sport', () => {
    renderModal();
    const select = screen.getByRole('combobox', { name: 'Sport to discover' });
    expect(select).toHaveValue('5'); // football
    expect(screen.getByRole('option', { name: 'Football' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Basketball' })).toBeInTheDocument();
  });

  it('reports a picked sport via onSportIdChange', async () => {
    const user = userEvent.setup();
    const onSportIdChange = vi.fn();
    renderModal({ onSportIdChange });

    await user.selectOptions(screen.getByRole('combobox', { name: 'Sport to discover' }), 'Basketball');
    expect(onSportIdChange).toHaveBeenCalledWith(6);
  });
});
