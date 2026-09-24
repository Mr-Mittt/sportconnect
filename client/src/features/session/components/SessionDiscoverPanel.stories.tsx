import type { Meta, StoryObj } from '@storybook/react-vite';
import type { LocationPickerProps } from '@/features/location/components/LocationPicker';
import type { SportKey, SportProfile } from '@/shared/types/sport';
import type { Location } from '@/shared/types/location';
import type { DiscoverDateSection, SessionListItem } from '../types';
import { SessionDiscoverPanel } from './SessionDiscoverPanel';

// Same closed/inert stub CreateSessionModal.stories.tsx uses — the picker Dialog stays closed
// (isOpen: false) in every story here, so only its shape needs to satisfy the prop type.
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

function makeLocation(name: string): Location {
  return {
    id: 1,
    sportId: 6,
    sportName: 'Basketball',
    name,
    address: null,
    latitude: null,
    longitude: null,
    sourceMapsUrl: null,
    claimedByVendorId: null,
    createdBy: 'user-1',
    createdAt: '2026-06-01T10:00:00',
    updatedAt: '2026-06-01T10:00:00',
  };
}

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
    title: 'Weekend 5-a-side',
    description: null,
    location: makeLocation('Riverside Courts'),
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

function makeSection(
  overrides: Partial<DiscoverDateSection> & Pick<DiscoverDateSection, 'date' | 'label'>,
): DiscoverDateSection {
  return {
    count: 0,
    isExpanded: true,
    sessions: [],
    isLoading: false,
    isError: false,
    hasMore: false,
    isFetchingMore: false,
    ...overrides,
  };
}

const twoSessionSections: DiscoverDateSection[] = [
  makeSection({
    date: '2026-08-01',
    label: 'Today',
    count: 2,
    sessions: [
      makeSession({ id: 1, title: 'Weekend 5-a-side' }),
      makeSession({ id: 2, title: 'Sunday pickup run', sportId: 5, sportName: 'Football' }),
    ],
  }),
  makeSection({ date: '2026-08-02', label: 'Tomorrow', count: 3, isExpanded: false }),
];

const favoriteLocations: Location[] = [
  makeLocation('Riverside Courts'),
  makeLocation('Downtown Turf'),
];

const meta = {
  title: 'Session/SessionDiscoverPanel',
  component: SessionDiscoverPanel,
  args: {
    sportsByKey,
    currentUserId: 'user-2', // not the sessions' creator (createdBy: 'user-1') by default
    onSearchModeChange: () => {},
    onSearchTextChange: () => {},
    onViewDetails: () => {},
    onParticipationAction: () => {},
    isParticipationActionPending: () => false,
    searchMode: 'sessions',
    searchText: '',
    quickDates: ['2026-08-01', '2026-08-02', '2026-08-03'],
    selectedDates: ['2026-08-01', '2026-08-02'],
    onToggleDate: () => {},
    dateOptionLabel: (date: string) =>
      date === '2026-08-01' ? 'Today' : date === '2026-08-02' ? 'Tomorrow (2nd Aug)' : date,
    dateLabel: (date: string) =>
      date === '2026-08-01' ? 'Today' : date === '2026-08-02' ? 'Tomorrow' : date,
    isDateSelectionAtMax: false,
    isDateFilterActive: true,
    resetDateSelection: () => {},
    isLocationFilterAvailable: true,
    selectedLocations: [],
    onToggleLocation: () => {},
    onClearLocationFilter: () => {},
    favoriteLocations,
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
    requestedSessions: [],
    isRequestedSessionsLoading: false,
    isRequestedSessionsError: false,
    hasMoreRequestedSessions: false,
    isFetchingMoreRequestedSessions: false,
    onLoadMoreRequestedSessions: () => {},
    startTimeFilter: undefined,
    onStartTimeFilterChange: () => {},
    startTime: undefined,
    onStartTimeChange: () => {},
    onClearTimeFilter: () => {},
    onToggleExpanded: () => {},
    onLoadMoreSection: () => {},
    isCountsLoading: false,
    isCountsError: false,
  },
  decorators: [(Story) => <div style={{ maxWidth: 640 }}>{Story()}</div>],
} satisfies Meta<typeof SessionDiscoverPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { dateSections: twoSessionSections },
};

export const CountsLoading: Story = {
  args: {
    dateSections: [makeSection({ date: '2026-08-01', label: 'Today' })],
    isCountsLoading: true,
  },
};

export const CountsError: Story = {
  args: {
    dateSections: [makeSection({ date: '2026-08-01', label: 'Today' })],
    isCountsError: true,
  },
};

export const SectionLoading: Story = {
  args: {
    dateSections: [makeSection({ date: '2026-08-01', label: 'Today', isLoading: true })],
  },
};

export const SectionError: Story = {
  args: {
    dateSections: [makeSection({ date: '2026-08-01', label: 'Today', isError: true })],
  },
};

export const EmptySection: Story = {
  args: {
    dateSections: [makeSection({ date: '2026-08-01', label: 'Today' })],
  },
};

export const LocationFilterUnavailable: Story = {
  args: {
    dateSections: [makeSection({ date: '2026-08-01', label: 'Today' })],
    isLocationFilterAvailable: false,
  },
};
