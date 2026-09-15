import type { Meta, StoryObj } from '@storybook/react-vite';
import type { LocationPickerProps } from '@/features/location/components/LocationPicker';
import type { Location } from '@/shared/types/location';
import type { Session } from '@/shared/types/session';
import { SessionPreparingCompletion } from './SessionPreparingCompletion';

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

const inertLocationPicker: LocationPickerProps = {
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
  favoriteLocationIds: new Set(),
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
    location: null,
    locationNote: null,
    scheduledStart: '2026-08-01T19:00:00',
    scheduledEndAt: null,
    status: 'PREPARING',
    cancelReason: null,
    cancelledBy: null,
    cancelledByFullName: null,
    cancelledAt: null,
    participantCount: 1,
    capacity: 10,
    feeType: null,
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

const meta = {
  title: 'Session/SessionPreparingCompletion',
  component: SessionPreparingCompletion,
  args: {
    session: makeSession(),
    selectedLocation: null,
    onOpenLocationPicker: () => {},
    locationPicker: inertLocationPicker,
    onSubmit: () => {},
    isSubmitting: false,
    isError: false,
  },
} satisfies Meta<typeof SessionPreparingCompletion>;

export default meta;
type Story = StoryObj<typeof meta>;

export const MissingBoth: Story = {};

export const MissingLocationOnly: Story = {
  args: { session: makeSession({ feeType: 'FREE' }) },
};

export const MissingLocationOnlyWithSelection: Story = {
  args: { session: makeSession({ feeType: 'FREE' }), selectedLocation: location },
};

export const MissingFeeOnly: Story = {
  args: { session: makeSession({ location }) },
};

export const SubmitError: Story = {
  args: { session: makeSession({ feeType: 'FREE' }), selectedLocation: location, isError: true },
};

export const Submitting: Story = {
  args: { session: makeSession({ feeType: 'FREE' }), selectedLocation: location, isSubmitting: true },
};
