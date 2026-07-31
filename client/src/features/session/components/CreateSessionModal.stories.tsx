import type { Meta, StoryObj } from '@storybook/react-vite';
import type { LocationPickerProps } from '@/features/location/components/LocationPicker';
import type { Location } from '@/shared/types/location';
import type { SportKey, SportProfile } from '@/shared/types/sport';
import { CreateSessionModal, type ManageableGroup } from './CreateSessionModal';

const sportsByKey: Record<SportKey, SportProfile> = {
  football: { key: 'football', label: 'Football', icon: 'ball-football', colorRamp: 'teal' },
  basketball: { key: 'basketball', label: 'Basketball', icon: 'ball-basketball', colorRamp: 'coral' },
  tennis: { key: 'tennis', label: 'Tennis', icon: 'ball-tennis', colorRamp: 'purple' },
};

const manageableGroups: ManageableGroup[] = [
  { id: 5, groupName: 'Riverside Ballers', sportId: 6 },
  { id: 8, groupName: 'Downtown Aces', sportId: 2 },
];

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
    manageableGroups: [],
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

export const StandaloneOnly: Story = {};

export const WithGroupOption: Story = {
  args: { manageableGroups },
};

export const LocationChosen: Story = {
  args: { manageableGroups, selectedLocation: location },
};

export const Submitting: Story = {
  args: { manageableGroups, selectedLocation: location, isSubmitting: true },
};

export const SubmitError: Story = {
  args: { manageableGroups, selectedLocation: location, isError: true },
};
