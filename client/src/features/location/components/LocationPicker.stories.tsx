import type { Meta, StoryObj } from '@storybook/react-vite';
import type { Location } from '../types';
import { LocationPicker } from './LocationPicker';

function location(overrides: Partial<Location>): Location {
  return {
    id: 1,
    sportId: 1,
    sportName: 'Football',
    name: 'Riverside Sports Complex',
    address: '123 Main St',
    latitude: 21.0285,
    longitude: 105.8542,
    sourceMapsUrl: null,
    claimedByVendorId: null,
    createdBy: 'user-1',
    createdAt: '2026-07-30T00:00:00',
    updatedAt: '2026-07-30T00:00:00',
    ...overrides,
  };
}

const meta = {
  title: 'Location/LocationPicker',
  component: LocationPicker,
  args: {
    isOpen: true,
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
  },
} satisfies Meta<typeof LocationPicker>;

export default meta;
type Story = StoryObj<typeof meta>;

export const SearchWithResults: Story = {
  args: {
    inputValue: 'riverside',
    results: [
      location({ id: 1, name: 'Riverside Sports Complex' }),
      location({ id: 2, name: 'Riverside Tennis Courts', address: null }),
    ],
  },
};

export const SearchEmpty: Story = {
  args: { inputValue: 'nonexistent venue' },
};

export const SearchLoading: Story = {
  args: { inputValue: 'riverside', isSearching: true },
};

export const SearchErrorState: Story = {
  args: { inputValue: 'riverside', isSearchError: true },
};

export const CreateModeEmpty: Story = {
  args: { mode: 'create' },
};

export const CreateModeResolving: Story = {
  args: { mode: 'create', mapsUrlInput: 'https://maps.app.goo.gl/abc123', isResolving: true },
};

export const CreateModeResolveError: Story = {
  args: { mode: 'create', mapsUrlInput: 'https://maps.app.goo.gl/abc123', isResolveError: true },
};

export const CreateModeResolvedNoCoordinates: Story = {
  args: {
    mode: 'create',
    mapsUrlInput: 'https://maps.app.goo.gl/abc123',
    resolvedNoCoordinates: true,
  },
};

export const CreateModeWithPreview: Story = {
  args: {
    mode: 'create',
    mapsUrlInput: 'https://maps.app.goo.gl/abc123',
    coordinates: { latitude: 21.0285, longitude: 105.8542 },
    name: 'Riverside Sports Complex',
    canSave: true,
  },
};

export const CreateModeSaving: Story = {
  args: {
    mode: 'create',
    coordinates: { latitude: 21.0285, longitude: 105.8542 },
    name: 'Riverside Sports Complex',
    canSave: true,
    isSaving: true,
  },
};

export const CreateModeSaveError: Story = {
  args: {
    mode: 'create',
    coordinates: { latitude: 21.0285, longitude: 105.8542 },
    name: 'Riverside Sports Complex',
    canSave: true,
    isSaveError: true,
  },
};
