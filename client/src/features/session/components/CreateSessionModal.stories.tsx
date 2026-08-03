import type { Meta, StoryObj } from '@storybook/react-vite';
import type { LocationPickerProps } from '@/features/location/components/LocationPicker';
import type { Location } from '@/shared/types/location';
import type { SportKey, SportProfile } from '@/shared/types/sport';
import { CreateSessionModal } from './CreateSessionModal';

// Real usage builds this from a partial API result via Object.fromEntries + a cast (see
// useMatchesPageData.ts/HomeFeedPage.tsx) — the single-sport-profile stories below mirror a
// caller who genuinely only has one, not all three keys.
const soleFootballSport = { football: { key: 'football', label: 'Football', icon: 'ball-football', colorRamp: 'teal' } } as Record<SportKey, SportProfile>;

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
  address: '12 River Rd',
  latitude: 21.0285,
  longitude: 105.8542,
  sourceMapsUrl: null,
  claimedByVendorId: null,
  createdBy: 'user-1',
  createdAt: '2026-06-01T10:00:00',
  updatedAt: '2026-06-01T10:00:00',
};

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

const meta = {
  title: 'Session/CreateSessionModal',
  component: CreateSessionModal,
  args: {
    isOpen: true,
    onClose: () => {},
    sportsByKey,
    selectedLocation: null,
    onOpenLocationPicker: () => {},
    locationPicker,
    onSubmit: () => {},
    isSubmitting: false,
    isError: false,
  },
} satisfies Meta<typeof CreateSessionModal>;

export default meta;
type Story = StoryObj<typeof meta>;

/** No `activeSport` and more than one sport profile — the "Select a sport" blank default. */
export const Default: Story = {};

/** `activeSport` set to a real sport pre-selects the Sport field. */
export const SportPreselectedFromActivePill: Story = {
  args: { activeSport: 'basketball' },
};

/** Only one sport profile at all pre-selects it regardless of `activeSport`. */
export const SportPreselectedFromSoleProfile: Story = {
  args: {
    sportsByKey: soleFootballSport,
    activeSport: 'all',
  },
};

export const LocationChosen: Story = {
  args: { activeSport: 'basketball', selectedLocation: location },
};

export const Submitting: Story = {
  args: { activeSport: 'basketball', selectedLocation: location, isSubmitting: true },
};

export const SubmitError: Story = {
  args: { activeSport: 'basketball', selectedLocation: location, isError: true },
};
