import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { LocationPickerProps } from '@/features/location/components/LocationPicker';
import type { SportKey, SportProfile } from '@/shared/types/sport';
import type { Location } from '@/shared/types/location';
import type { DiscoverDateSection, SessionListItem } from '../types';
import { SessionDiscoverPanel } from './SessionDiscoverPanel';

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

function makeSection(overrides: Partial<DiscoverDateSection> = {}): DiscoverDateSection {
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

const renderPanel = (overrides: Partial<React.ComponentProps<typeof SessionDiscoverPanel>> = {}) =>
  render(
    <SessionDiscoverPanel
      searchMode="sessions"
      onSearchModeChange={() => {}}
      searchText=""
      onSearchTextChange={() => {}}
      quickDates={['2026-08-01']}
      selectedDates={['2026-08-01']}
      onToggleDate={() => {}}
      dateOptionLabel={() => 'Today'}
      dateLabel={() => 'Today'}
      isDateSelectionAtMax={false}
      isDateFilterActive={false}
      resetDateSelection={() => {}}
      isLocationFilterAvailable
      selectedLocations={[]}
      onToggleLocation={() => {}}
      onClearLocationFilter={() => {}}
      favoriteLocations={[]}
      isFavoriteLocationsLoading={false}
      locationSearchText=""
      onLocationSearchTextChange={() => {}}
      locationSearchResults={[]}
      isLocationSearchLoading={false}
      onOpenLocationPicker={() => {}}
      locationPicker={locationPicker}
      selectedStatuses={[]}
      onToggleStatus={() => {}}
      minOpenSlotsText=""
      onMinOpenSlotsTextChange={() => {}}
      onClearOpenSlotsFilter={() => {}}
      feeType={undefined}
      onToggleFeeType={() => {}}
      maxFeeAmountVndText=""
      onMaxFeeAmountVndChange={() => {}}
      onClearFeeFilter={() => {}}
      requestedSessions={[]}
      isRequestedSessionsLoading={false}
      isRequestedSessionsError={false}
      hasMoreRequestedSessions={false}
      isFetchingMoreRequestedSessions={false}
      onLoadMoreRequestedSessions={() => {}}
      startTimeFilter={undefined}
      onStartTimeFilterChange={() => {}}
      startTime={undefined}
      onStartTimeChange={() => {}}
      onClearTimeFilter={() => {}}
      dateSections={[makeSection()]}
      onToggleExpanded={() => {}}
      onLoadMoreSection={() => {}}
      isCountsLoading={false}
      isCountsError={false}
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

  it("shows a section's loading state", () => {
    renderPanel({ dateSections: [makeSection({ isLoading: true, sessions: [] })] });
    expect(screen.getByText('Loading…')).toBeInTheDocument();
  });

  it("shows a section's error state", () => {
    renderPanel({ dateSections: [makeSection({ isError: true, sessions: [] })] });
    expect(screen.getByRole('alert')).toHaveTextContent("Couldn't load sessions for Today.");
  });

  it('shows the empty state copy for a section with no sessions', () => {
    renderPanel({ dateSections: [makeSection({ sessions: [] })] });
    expect(screen.getByText('No sessions to discover on Today.')).toBeInTheDocument();
  });

  it("shows a section's load-more button and reports the date it belongs to", async () => {
    const user = userEvent.setup();
    const onLoadMoreSection = vi.fn();
    renderPanel({ dateSections: [makeSection({ hasMore: true })], onLoadMoreSection });

    await user.click(screen.getByRole('button', { name: 'Load more' }));
    expect(onLoadMoreSection).toHaveBeenCalledWith('2026-08-01');
  });

  it('reports which date was toggled when a section header is clicked', async () => {
    const user = userEvent.setup();
    const onToggleExpanded = vi.fn();
    renderPanel({ onToggleExpanded });

    await user.click(screen.getByRole('button', { name: /Collapse Today \(1\)/ }));
    expect(onToggleExpanded).toHaveBeenCalledWith('2026-08-01');
  });

  it('shows the counts loading/error copy', () => {
    const { rerender } = renderPanel({ isCountsLoading: true });
    expect(screen.getByText('Loading session counts…')).toBeInTheDocument();

    rerender(
      <SessionDiscoverPanel
        searchMode="sessions"
        onSearchModeChange={() => {}}
        searchText=""
        onSearchTextChange={() => {}}
        quickDates={['2026-08-01']}
        selectedDates={['2026-08-01']}
        onToggleDate={() => {}}
        dateOptionLabel={() => 'Today'}
        dateLabel={() => 'Today'}
        isDateSelectionAtMax={false}
        isDateFilterActive={false}
        resetDateSelection={() => {}}
        isLocationFilterAvailable
        selectedLocations={[]}
        onToggleLocation={() => {}}
        onClearLocationFilter={() => {}}
        favoriteLocations={[]}
        isFavoriteLocationsLoading={false}
        locationSearchText=""
        onLocationSearchTextChange={() => {}}
        locationSearchResults={[]}
        isLocationSearchLoading={false}
        onOpenLocationPicker={() => {}}
        locationPicker={locationPicker}
        selectedStatuses={[]}
        onToggleStatus={() => {}}
        minOpenSlotsText=""
        onMinOpenSlotsTextChange={() => {}}
        onClearOpenSlotsFilter={() => {}}
        feeType={undefined}
        onToggleFeeType={() => {}}
        maxFeeAmountVndText=""
        onMaxFeeAmountVndChange={() => {}}
        onClearFeeFilter={() => {}}
        requestedSessions={[]}
        isRequestedSessionsLoading={false}
        isRequestedSessionsError={false}
        hasMoreRequestedSessions={false}
        isFetchingMoreRequestedSessions={false}
        onLoadMoreRequestedSessions={() => {}}
        startTimeFilter={undefined}
        onStartTimeFilterChange={() => {}}
        startTime={undefined}
        onStartTimeChange={() => {}}
        onClearTimeFilter={() => {}}
        dateSections={[makeSection()]}
        onToggleExpanded={() => {}}
        onLoadMoreSection={() => {}}
        isCountsLoading={false}
        isCountsError
        sportsByKey={sportsByKey}
        currentUserId="user-2"
        onViewDetails={() => {}}
        onParticipationAction={() => {}}
        isParticipationActionPending={() => false}
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent(
      "Couldn't load session counts for these dates.",
    );
  });

  it('reports search text/mode changes', async () => {
    const user = userEvent.setup();
    const onSearchTextChange = vi.fn();
    const onSearchModeChange = vi.fn();
    renderPanel({ onSearchTextChange, onSearchModeChange });

    await user.type(screen.getByRole('textbox', { name: 'Search sessions' }), 'x');
    expect(onSearchTextChange).toHaveBeenCalledWith('x');

    await user.selectOptions(screen.getByRole('combobox', { name: 'Search scope' }), 'sessions');
    // 'sessions' is the dropdown's only option (2026-09-23 revision dropped 'location'/'gear'),
    // so this just confirms the select is wired without asserting a no-op value.
    expect(screen.getByRole('combobox', { name: 'Search scope' })).toHaveValue('sessions');
  });

  it('renders the Date/Time/Location filter pills as interactive controls', () => {
    renderPanel({ selectedDates: [] }); // Date's own label is exercised separately below
    expect(screen.getByRole('button', { name: /^Date/ })).not.toHaveAttribute('aria-disabled');
    expect(screen.getByRole('button', { name: /^Time/ })).not.toHaveAttribute('aria-disabled');
    expect(screen.getByRole('button', { name: /^Location/ })).not.toHaveAttribute('aria-disabled');
  });

  // CLIENT-SESSION-29 revision (2026-09-23) — the Date pill's trigger label.
  it('labels the Date pill with the date itself when exactly one is selected', () => {
    renderPanel({ selectedDates: ['2026-08-01'] });
    expect(screen.getByRole('button', { name: 'Today' })).toBeInTheDocument();
  });

  it('labels the Date pill with a count once more than one is selected', () => {
    renderPanel({ selectedDates: ['2026-08-01', '2026-08-02'] });
    expect(screen.getByRole('button', { name: 'Date (2)' })).toBeInTheDocument();
  });

  // 2026-09-23 (second revision) — active-filter reset "x"s, threaded through from the panel.
  it('reports the Date reset via resetDateSelection', async () => {
    const user = userEvent.setup();
    const resetDateSelection = vi.fn();
    renderPanel({ isDateFilterActive: true, resetDateSelection });

    await user.click(screen.getByRole('button', { name: 'Reset date filter' }));
    expect(resetDateSelection).toHaveBeenCalledTimes(1);
  });

  it('reports the Location clear-all via onClearLocationFilter', async () => {
    const user = userEvent.setup();
    const onClearLocationFilter = vi.fn();
    renderPanel({ selectedLocations: [location], onClearLocationFilter });

    await user.click(screen.getByRole('button', { name: 'Clear location filter' }));
    expect(onClearLocationFilter).toHaveBeenCalledTimes(1);
  });

  it('renders the Location pill disabled when unavailable (no specific sport selected)', () => {
    renderPanel({ isLocationFilterAvailable: false });
    expect(screen.getByRole('button', { name: 'Location' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
  });
});
